import asyncio
import hmac
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import Field, JsonValue, SecretStr, ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .. import __version__
from ..application.commands import CommandBatch, CommandError, ProjectConflict
from ..application.projects import ProjectNotFound
from ..camp_sample import campfire_project
from ..dialogs import choose_path, open_folder
from ..domain.models import Contract, Name, Project, Revision, World, utc_now
from ..drafts import ReviewError, author_hash, review
from ..exports import ExportRequest, build_export
from ..generation import GenerateInput, GenerationEngine
from ..migration import DocumentError, dump_project, load_document
from ..providers import ChatProvider, ProviderError, connection_test
from ..samples import outpost_project
from ..simulation import SimulationError, SimulationInput, rehearse
from ..storage import (
    ConnectionProfile,
    FileProblem,
    LocalProjects,
    ModelDefaults,
    ProviderProfile,
    WorkspacePreferences,
    read_json,
)
from ..templates import (
    ApplyTemplate,
    ArchiveTemplate,
    CaptureTemplate,
    TemplateLibrary,
    apply_commands,
    capture,
)


class NewProject(Contract):
    name: Name = "未命名项目"
    world: World = Field(default_factory=World)


class DocumentInput(Contract):
    document: dict[str, JsonValue]


class FileInput(Contract):
    path: str
    discard: bool = False


class SaveInput(Contract):
    expected_revision: Revision
    path: str | None = None


class HistoryInput(Contract):
    expected_revision: Revision
    direction: Literal["undo", "redo"]


class DiskProjectInput(Contract):
    name: Name
    folder: str
    filename: Name
    template: Literal["blank", "lighthouse", "outpost", "campfire"] = "blank"
    # Legacy callers explicitly name a file; the UI now always chooses folder.
    layout: Literal["file", "folder"] = "file"


class OrganizeInput(Contract):
    expected_revision: Revision
    folder: str


class RestoreInput(Contract):
    expected_revision: Revision
    point_id: str


class CloseInput(Contract):
    discard: bool = False


class DialogInput(Contract):
    kind: Literal["folder", "open", "save"]


class ConnectionTestInput(Contract):
    profile: ProviderProfile
    api_key: SecretStr = SecretStr("")


class CredentialInput(Contract):
    api_key: SecretStr
    endpoint: str


def resource_dir():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[3]))


def create_app(
    data_dir=None, project_dir=None, dialog_provider=choose_path, frontend_dir=None, provider=None,
    folder_opener=open_folder,
) -> FastAPI:
    store = LocalProjects(
        data_dir or os.environ.get("NPCS_AI_STUDIO_DATA_DIR") or os.environ.get("LUDO_DATA_DIR"),
        project_dir or os.environ.get("NPCS_AI_STUDIO_PROJECT_DIR") or os.environ.get("LUDO_PROJECT_DIR"),
    )
    adapter = provider or ChatProvider()
    templates = TemplateLibrary(store.data_dir)
    engine = GenerationEngine(store, adapter)
    frontend = (
        Path(frontend_dir)
        if frontend_dir
        else resource_dir() / ("frontend" if getattr(sys, "frozen", False) else "dist/client")
    )

    @asynccontextmanager
    async def lifespan(app):
        yield
        await engine.shutdown()
        store.shutdown()

    app = FastAPI(
        title="NPCs AI Studio · 本地数据服务",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    session = secrets.token_urlsafe(32)
    app.state.projects = store
    app.state.generation = engine

    @app.middleware("http")
    async def local_session(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin:
            parsed = urlsplit(origin)
            allowed_origin = f"{parsed.scheme}://{request.headers.get('host')}"
            dev_origins = (
                {"http://127.0.0.1:4173", "http://localhost:4173"}
                if not getattr(sys, "frozen", False)
                else set()
            )
            if origin not in {allowed_origin, *dev_origins} or parsed.scheme not in (
                "http",
                "https",
            ):
                return JSONResponse(
                    {"error": "foreign_origin", "message": "仅允许同源的本机访问"}, status_code=403
                )
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"error": "foreign_origin"}, status_code=403)
        public = {
            "/",
            "/start",
            "/docs",
            "/api/session",
            "/api/health",
            "/api/v2/schema",
            "/openapi.json",
            "/favicon.ico",
        }
        if (
            request.url.path not in public
            and not request.url.path.startswith("/assets/")
            and not hmac.compare_digest(
                request.cookies.get("ludo_session", "").encode("utf-8"), session.encode("utf-8")
            )
        ):
            response = JSONResponse(
                {
                    "error": "session_required",
                    "message": "本机会话已失效，请重试当前操作以恢复连接",
                },
                status_code=401,
            )
            # Older open pages can bootstrap/renew through a same-origin read.
            # This request remains rejected; no protected handler is executed.
            if request.method == "GET":
                response.set_cookie("ludo_session", session, httponly=True, samesite="strict")
                response.headers["Cache-Control"] = "no-store"
            return response
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
        )
        return response

    def invalid(exc):
        errors = (
            exc.errors(include_url=False, include_context=False, include_input=False)
            if isinstance(exc, ValidationError)
            else [
                {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                for error in exc.errors()
            ]
        )
        return JSONResponse({"error": "invalid_document", "details": errors}, status_code=422)

    @app.exception_handler(RequestValidationError)
    async def request_invalid(request, exc):
        return invalid(exc)

    @app.exception_handler(ValidationError)
    async def document_invalid(request, exc):
        return invalid(exc)

    @app.exception_handler(DocumentError)
    @app.exception_handler(CommandError)
    @app.exception_handler(ReviewError)
    async def operation_invalid(request, exc):
        return JSONResponse({"error": "invalid_operation", "message": str(exc)}, status_code=422)

    @app.exception_handler(ProviderError)
    async def provider_invalid(request, exc):
        return JSONResponse({"error": exc.code, "message": str(exc)}, status_code=502)

    @app.exception_handler(ProjectNotFound)
    async def missing(request, exc):
        return JSONResponse({"error": "project_not_found"}, status_code=404)

    @app.exception_handler(ProjectConflict)
    async def conflict(request, exc):
        return JSONResponse(
            {"error": "revision_conflict", "current_revision": exc.current_revision},
            status_code=409,
        )

    @app.exception_handler(FileProblem)
    async def file_problem(request, exc):
        return JSONResponse(
            {"error": exc.code, "message": str(exc)},
            status_code=409
            if exc.code
            in {"disk_conflict", "file_exists", "file_busy", "already_open", "unsaved_changes"}
            else 422,
        )

    @app.exception_handler(OSError)
    async def file_io_error(request, exc):
        return JSONResponse(
            {
                "error": "file_io_error",
                "message": "文件操作失败，请检查目录权限、磁盘空间或文件占用；未保存修改仍保留在当前会话",
            },
            status_code=503,
        )

    @app.exception_handler(json.JSONDecodeError)
    async def bad_json(request, exc):
        return JSONResponse(
            {"error": "invalid_json", "message": "JSON 文件损坏，请尝试打开备份"}, status_code=422
        )

    @app.get("/start", include_in_schema=False)
    def start():
        response = RedirectResponse(
            "/" if (frontend / "index.html").exists() else "/docs", status_code=303
        )
        response.set_cookie("ludo_session", session, httponly=True, samesite="strict")
        return response

    @app.get("/", include_in_schema=False)
    def home():
        response = (
            FileResponse(frontend / "index.html")
            if (frontend / "index.html").exists()
            else RedirectResponse("/docs")
        )
        response.set_cookie("ludo_session", session, httponly=True, samesite="strict")
        return response

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        return Response(status_code=204)

    @app.get("/api/session", include_in_schema=False)
    def bootstrap():
        response = JSONResponse({"ready": True})
        response.set_cookie("ludo_session", session, httponly=True, samesite="strict")
        return response

    @app.get("/docs", response_class=HTMLResponse, include_in_schema=False)
    def docs():
        return """<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>NPCs AI Studio · 本地数据服务</title><style>body{background:#222321;color:#ded8cf;font:16px/1.8 system-ui;margin:6vh auto;padding:32px;max-width:920px}a{color:#d9a67d}h1{font-size:32px}small{color:#b3aa9d}code{color:#d9a67d}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #45453e;padding:10px}aside{background:#33332d;border-left:3px solid #c69872;padding:16px}h2{font-size:21px;margin-top:32px}</style>
<small>NPCs AI Studio / DEVELOPMENT / BATCH 04</small><h1>本地项目数据服务</h1>
<p>Python 数据底座已就绪：世界、角色、关系、条件、事件、对话分支、文本、草稿和画布使用统一的 v2 项目契约。</p>
<aside>本地文件与导演台已接入。选择工程文件后自动保存，重启可重新打开；未指定文件的草稿仍只在当前会话。备份与历史保存在工程旁，偏好在本机应用目录。</aside>
<p><a href="/">打开导演台</a> · <a href="/api/health">服务状态</a> · <a href="/api/v2/schema">项目 JSON Schema</a> · <a href="/openapi.json">OpenAPI 契约</a> · <a href="/start">建立本机会话</a></p>
<h2>项目契约接口</h2><table><tr><th>接口</th><th>用途</th></tr>
<tr><td>POST /api/v2/projects</td><td>创建空白项目</td></tr>
<tr><td>GET /api/v2/projects/{id}</td><td>读取暂存项目</td></tr>
<tr><td>POST /api/v2/projects/validate</td><td>检查结构、引用和类型，不写入暂存区</td></tr>
<tr><td>POST /api/v2/projects/import</td><td>导入 v2，或迁移并导入旧版 v1</td></tr>
<tr><td>POST /api/v2/projects/{id}/commands</td><td>按版本提交修改；整批成功后才生效</td></tr>
<tr><td>POST /api/v2/projects/{id}/simulate</td><td>重放时间、场景与选择，返回状态和变化原因；不改作者设定</td></tr>
<tr><td>GET /api/v2/projects/{id}/export</td><td>导出不含连接凭据的 JSON 文件</td></tr></table>
<h2>版本与执行边界</h2><p>内容和画布布局分别记录版本。旧版本修改会返回 409，非法引用返回 422。通用预演已接入：事件、规则、人物认知、场景与对话选择从初始状态确定性重放；模型连接、限量生成任务和字段草稿审核已接入；生成经审核后才写入正式工程。</p>
<small>开发服务仅监听 127.0.0.1；项目文件不包含 API Key。导演台使用 v2 项目；支持 chat/completions 文本接口；具体服务商兼容性需用用户配置验证。</small></html>"""

    @app.exception_handler(SimulationError)
    async def simulation_error(request, exc):
        return JSONResponse({"error": "simulation_error", "message": str(exc)}, status_code=422)

    @app.post("/api/v2/projects/{project_id}/simulate")
    def simulate(project_id: str, body: SimulationInput):
        project = store.get(project_id)
        if project.content_revision != body.expected_content_revision:
            return JSONResponse(
                {
                    "error": "stale_simulation",
                    "message": "内容版本已变化，请用最新工程重新预演",
                    "content_revision": project.content_revision,
                },
                status_code=409,
            )
        return rehearse(project, body)

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "version": __version__,
            "schema_version": 2,
            "batch": 4,
            "storage_mode": "local_json",
            "disk_persistence": True,
            "story_execution": True,
            "model_generation": True,
            "draft_review": True,
            "author_context": True,
        }

    @app.get("/api/v2/schema")
    def schema():
        return Project.model_json_schema()

    @app.get("/api/workspace")
    def workspace():
        return store.workspace()

    @app.put("/api/workspace/preferences")
    def workspace_preferences(body: WorkspacePreferences):
        return store.set_preferences(body)

    @app.get("/api/templates")
    def template_library():
        return templates.snapshot()

    @app.post("/api/templates")
    def capture_template(body: CaptureTemplate):
        project = store.get(body.project_id)
        if project.revision != body.expected_revision:
            raise ProjectConflict(project.revision)
        item = capture(project, body.source_kind, body.source_id, body.name)
        return templates.change(body.library_revision, item=item)

    @app.post("/api/templates/{template_id}/archive")
    def archive_template(template_id: str, body: ArchiveTemplate):
        return templates.change(
            body.library_revision, identifier=template_id, archived=body.archived
        )

    @app.post("/api/v2/projects/{project_id}/templates/apply")
    def instantiate_template(project_id: str, body: ApplyTemplate):
        commands, identifier = apply_commands(
            store.get(project_id), templates.get(body.template_id), body
        )
        project = store.apply(project_id, commands)
        return {"project": project, "created_id": identifier}

    @app.post("/api/v2/projects/{project_id}/handoff")
    def handoff(project_id: str, body: ExportRequest):
        return build_export(store.get(project_id), body)

    @app.post("/api/v2/projects/{project_id}/export-file")
    def export_file(project_id: str, body: ExportRequest):
        with store._lock:
            return store.save_export(project_id, build_export(store.get(project_id), body))

    @app.put("/api/workspace/model-profile")
    def profile(body: ConnectionProfile):
        return store.set_profile(body)

    @app.put("/api/workspace/model-profiles")
    def provider_profile(body: ProviderProfile):
        return store.set_provider(body)

    @app.put("/api/workspace/model-profiles/{profile_id}/credential")
    def save_credential(profile_id: str, body: CredentialInput):
        with store._lock:
            profile = store.credential_profile(profile_id)
            if profile.endpoint != body.endpoint:
                raise FileProblem("接口地址已修改，请重新打开配置后保存密钥")
            store.credentials.set(profile, body.api_key.get_secret_value())
            return store.workspace()

    @app.delete("/api/workspace/model-profiles/{profile_id}/credential")
    def clear_credential(profile_id: str):
        with store._lock:
            if not any(p.id == profile_id for p in store.settings.model_profiles):
                raise FileProblem("模型配置不存在")
            store.credentials.clear(profile_id)
            return store.workspace()

    @app.put("/api/workspace/model-defaults")
    def model_defaults(body: ModelDefaults):
        return store.set_model_defaults(body)

    @app.delete("/api/workspace/model-profiles/{profile_id}")
    def archive_profile(profile_id: str):
        return store.archive_provider(profile_id)

    @app.post("/api/workspace/model-profiles/{profile_id}/restore")
    def restore_profile(profile_id: str):
        return store.archive_provider(profile_id, restore=True)

    @app.post("/api/models/test")
    async def test_connection(body: ConnectionTestInput):
        # Resolve only against the actual submitted destination; unsaved new
        # endpoints cannot receive a credential bound to the old endpoint.
        key = store.provider_key(body.profile, body.api_key.get_secret_value())
        stored = next((p for p in store.settings.model_profiles if p.id == body.profile.id), None)
        if not body.api_key.get_secret_value() and (not stored or stored.archived):
            key = ""
        if body.profile.mode == "remote" and not key:
            raise ReviewError("请填写 API Key 或保存此配置的本机密钥")
        try:
            result = await connection_test(adapter, body.profile, key)
        except ProviderError as exc:
            store.record_model_test(body.profile, "failed", str(exc))
            raise
        store.record_model_test(body.profile, "success", result["message"])
        return result

    @app.post("/api/v2/projects/{project_id}/generate", status_code=202)
    async def generate(project_id: str, body: GenerateInput):
        return await engine.start(project_id, body)

    @app.get("/api/v2/projects/{project_id}/generation")
    def generation_jobs(project_id: str):
        project = store.get(project_id)
        return [
            (
                engine.snapshot(engine.jobs[r.id])
                if engine.jobs[r.id]["status"] in {"queued", "running"}
                else engine.snapshot(engine.jobs[r.id]) | r.model_dump(mode="json")
            )
            if r.id in engine.jobs
            else {
                **r.model_dump(mode="json"),
                "project_id": project_id,
                "storage_error": "",
            }
            for r in project.content.generation_history
        ]

    @app.post("/api/v2/projects/{project_id}/generation/{job_id}/cancel")
    async def cancel_generation(project_id: str, job_id: str):
        store.get(project_id)
        job = engine.jobs.get(job_id)
        if not job or job["project_id"] != project_id:
            raise ReviewError("该工程没有此运行任务")
        return await engine.cancel(job_id)

    @app.get("/api/v2/projects/{project_id}/generation/events")
    async def generation_events(project_id: str, request: Request):
        store.get(project_id)

        async def events():
            previous = None
            while not await request.is_disconnected():
                value = json.dumps(generation_jobs(project_id), ensure_ascii=False)
                if value != previous:
                    yield f"event: update\ndata: {value}\n\n"
                    previous = value
                else:
                    yield ": keepalive\n\n"
                await asyncio.sleep(0.5)

        return StreamingResponse(events(), media_type="text/event-stream")

    @app.get("/api/v2/projects/{project_id}/drafts/{draft_id}/review")
    def draft_review(project_id: str, draft_id: str):
        return review(store.get(project_id), draft_id)

    @app.post("/api/files/dialog")
    def dialog(body: DialogInput):
        return {"path": dialog_provider(body.kind, store.settings.project_folder)}

    @app.post("/api/files/open")
    def open_file(body: FileInput):
        result = store.open_file(body.path, body.discard)
        engine.recover(result["project"]["project_id"])
        return store.envelope(store.get(result["project"]["project_id"])) | (
            {"file": result["file"]} if result["file"].get("migration_source") else {}
        )

    @app.post("/api/files/new", status_code=201)
    def new_file(body: DiskProjectInput):
        if Path(body.filename).name != body.filename or any(
            c in body.filename for c in '\\/:*?"<>|'
        ):
            raise FileProblem("文件名不能包含路径或系统保留字符")
        if body.template == "campfire":
            project = campfire_project()
        elif body.template == "outpost":
            project = outpost_project()
        elif body.template == "lighthouse":
            path = resource_dir() / (
                "examples/lighthouse-v2.ludo.json"
                if getattr(sys, "frozen", False)
                else "docs/examples/lighthouse-v2.ludo.json"
            )
            project = load_document(read_json(path))
        else:
            project = Project()
        project.project_id = Project().project_id
        project.name = body.name
        project.metadata.created_at = project.metadata.updated_at = utc_now()
        store.add(project)
        try:
            if body.layout == "folder":
                return store.save_in_folder(project.project_id, project.revision, body.folder, body.filename)
            return store.save(
                project.project_id, project.revision, str(Path(body.folder) / body.filename)
            )
        except Exception:
            store.close_project(project.project_id, discard=True)
            raise

    @app.get("/api/v2/projects/{project_id}/file")
    def file_status(project_id: str):
        return store.status(project_id)

    @app.post("/api/v2/projects/{project_id}/organize")
    def organize_project(project_id: str, body: OrganizeInput):
        if engine.has_active(project_id):
            raise FileProblem("请先取消或等待该工程的生成任务", "task_running")
        status = store.status(project_id)
        if not status["path"]:
            raise FileProblem("请先保存本地工程，再整理项目文件夹")
        return store.save_in_folder(
            project_id, body.expected_revision, body.folder,
            Path(status["path"]).name, copy_history=True,
        )

    @app.post("/api/v2/projects/{project_id}/open-folder")
    def show_project_folder(project_id: str):
        folder = store.status(project_id)["folder"]
        if not folder:
            raise FileProblem("请先保存本地工程")
        folder_opener(folder)
        return {"folder": folder, "opened": True}

    @app.post("/api/v2/projects/{project_id}/save")
    def save_file(project_id: str, body: SaveInput):
        return store.save(project_id, body.expected_revision, body.path)

    @app.get("/api/v2/projects/{project_id}/recovery")
    def recovery(project_id: str):
        return store.recovery_points(project_id)

    @app.post("/api/v2/projects/{project_id}/restore")
    def restore(project_id: str, body: RestoreInput):
        return store.restore(project_id, body.point_id, body.expected_revision)

    @app.post("/api/v2/projects/{project_id}/close")
    def close_project(project_id: str, body: CloseInput):
        if engine.has_active(project_id):
            raise FileProblem("请先取消或等待该工程的生成任务", "task_running")
        store.close_project(project_id, body.discard)
        return {"closed": True}

    @app.post("/api/v2/projects", response_model=Project, status_code=201)
    def create(body: NewProject):
        return store.add(Project(name=body.name, content={"world": body.world}))

    @app.get("/api/v2/projects")
    def listing():
        return [
            {"project_id": p.project_id, "name": p.name, "revision": p.revision}
            for p in store.list()
        ]

    @app.post("/api/v2/projects/validate")
    def validate(body: DocumentInput):
        project = load_document(body.document)
        return {
            "valid": True,
            "schema_version": 2,
            "project_id": project.project_id,
            "warnings": project.metadata.migration.warnings if project.metadata.migration else [],
        }

    @app.post("/api/v2/projects/import", response_model=Project, status_code=201)
    def importing(body: DocumentInput):
        return store.add(load_document(body.document))

    @app.get("/api/v2/projects/{project_id}", response_model=Project)
    def get(project_id: str):
        return store.get(project_id)

    @app.get("/api/v2/projects/{project_id}/author-context")
    def author_context(project_id: str):
        project = store.get(project_id)
        return {
            "format": "ludo-author-context",
            "version": 1,
            "project": project.model_dump(mode="json"),
            "author_hash": author_hash(project),
        }

    @app.post("/api/v2/projects/{project_id}/commands", response_model=Project)
    def commands(project_id: str, body: CommandBatch):
        return store.apply(project_id, body)

    @app.get("/api/v2/projects/{project_id}/edit-history")
    def edit_history(project_id: str):
        return store.edit_history(project_id)

    @app.post("/api/v2/projects/{project_id}/edit-history")
    def undo_edit(project_id: str, body: HistoryInput):
        store.undo_edit(project_id, body.expected_revision, body.direction)
        return store.envelope(store.get(project_id))

    @app.get("/api/v2/projects/{project_id}/export")
    def export(project_id: str):
        project = store.get(project_id)
        return Response(
            dump_project(project),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{project.project_id}.ludo.json"'
            },
        )

    if (frontend / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")
    return app


app = create_app()
