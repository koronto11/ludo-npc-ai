# NPCs AI Studio · Python 本地工程服务

当前主线包括 v2 数据契约、引用校验、旧工程迁移、原子编辑与撤销、本地工程目录/保存/恢复、通用剧情与卡片预演、模型配置与 Windows 加密凭据、限量生成与字段审核，以及中英文 Skill 协同、模板和导出。生成仅针对已绑定本地文件的工程；先保存独立草稿，审核后更新正式内容。自动化协议夹具不代表真实服务商的输出质量验收。架构总览见 [当前架构](../docs/architecture.md)，批次交付文档保留阶段性的证据与约束。

## 开发环境

在仓库根目录使用 Python 3.12+。本次验证环境为 Windows、Python 3.13.9，使用独立 `backend/.venv`，未修改系统 Python 依赖。精确依赖版本记录在 `requirements-dev.lock`，作为 pip 约束文件使用：

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e './backend[dev,package]' -c backend/requirements-dev.lock
backend/.venv/Scripts/python.exe -m ludo_npc --data-dir .local-data --project-dir .local-projects
```

默认监听 `http://127.0.0.1:4174`，只运行一个进程；`--port` 可以更改端口。构建前端后，`/` 提供完整导演台，`/docs` 提供本地开发说明，`/api/session` 建立本机会话。开发时 React 使用 4173 并代理 `/api` 到 4174。上述目录参数是仓库内的开发专用覆盖；省略参数时，工程默认建议目录为用户 `Documents/NPCs AI Studio Projects`，配置为 `%LOCALAPPDATA%/NPCs AI Studio`。用户可以更改工程目录。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| `ludo_npc/domain/models.py` | 作者设定、事实、状态、条件、效果、对话、草稿与画布的数据契约 |
| `ludo_npc/domain/integrity.py` | ID 唯一性、引用、类型、地点循环、对话跳转和初始知识检查 |
| `ludo_npc/application/commands.py` | 编辑命令、原子提交、版本冲突与内容/布局修订号 |
| `ludo_npc/application/projects.py` | 带锁的进程内编辑暂存区；文件仓库继承它并明确保存状态 |
| `ludo_npc/storage.py` | 本地 JSON、原子替换、进程锁、外部修改检查、备份与最近项目 |
| `ludo_npc/simulation.py` | 条件与效果、一次性事件/规则、场景与对话记录、分支重放和变化解释 |
| `ludo_npc/providers.py` | chat/completions HTTP、流式收集、超时、错误分类和有限重试 |
| `ludo_npc/generation.py` | 上下文、结构输出校验、并发任务、取消、用量和中断恢复 |
| `ludo_npc/drafts.py` | 作者内容摘要、字段差异、确认保护、接受/拒绝与重新比较 |
| `ludo_npc/dialogs.py` | Tk 系统文件/目录选择器，失败时提示使用完整路径 |
| `ludo_npc/api/app.py` | 本地 API、会话保护、脱离输入值的错误报告 |
| `ludo_npc/migration.py` | 明确映射旧版字段，保留迁移警告和预演快照 |
| `ludo_npc/tools.py` | 生成契约/示例、检查漂移、迁移指定文件到新文件 |
| `tests/` | 数据、迁移、命令与 API 的自动化验证 |

## 数据约定

v2 导出包含 `format: ludo-npc-project` 和整数 `schema_version: 2`。所有实体采用稳定 ID，跨类型也不允许重复；引用同时包含类型与 ID。姓名变化不改变引用。

`content` 保存作者定义、初始状态、预演输入、草稿和生成记录；`editor` 保存画布位置。初始状态不是当前预演结果，草稿字段也不会自动覆盖角色设定。JSON Schema 描述结构；跨对象引用和知识时间等规则由 Python 项目校验额外检查。

`revision` 每次有效事务增加一次。人物/世界修改增加 `content_revision`，画布修改增加 `layout_revision`，同时修改两者则两者都增加。没有变化的命令不增加修订号。命令必须带 `expected_revision`，旧版本返回 409；整批验证通过才提交，失败时不保留任何半成品。删除存在引用的对象会拒绝提交，应在同批命令中处理依赖关系；删除无依赖实体会一并移除它的画布节点。

条件支持 always、all/any/not、变量比较、时间、事件、人物知识、人物地点和预演场景；效果支持变量设置/累加、授予知识、位置/行为变化、解锁文本。Python 执行器读取这些声明计算状态，不执行自由 Python 表达式。事件/规则在一次分支重放中只触发一次，默认最多 2048 个执行步骤，对话图最多进入 128 次节点；达到上限返回诊断和不完整标记。初始知识仅保存事实 ID；获知渠道、错误认知和更详细的认知历史后续补充。

预演从初始状态重算，只处理目标时间及之前的场景/对话记录。场景变化与玩家选择用 `sequence` 保存同一时间内的操作顺序，兼容没有该字段的旧 v2 文件。初始变量覆盖是分支起点参数，改变它会重算整个分支。保存的是输入，不把预演后的状态写回人物定义。

草稿记录目标、创建/修改方式、基础内容版本、作者内容摘要、基础字段值、候选与来源引用。`review_draft` 支持接受指定字段或拒绝；确认字段的候选修改由后端拦截。作者内容变化使草稿过期，`rebase_draft` 显式按当前工程更新比较基准，不自动接受。批量审核使用事务起点的摘要，任何一份失败则整批不提交。`put_draft` 只编辑未审核候选，不能复活已审核记录或更改目标与基准；手动作者编辑仍可修改确认字段。

草稿、生成记录、预演分支和画布不进入作者内容摘要；任务更新仍增加工程修订号。前端只在作者定义及布局未变的元数据冲突上有限重试。结构和引用校验不能证明自然语言没有泄密或矛盾，仍需作者审核。

项目结构不接受模型连接或 API Key 字段。旧版的模型配置和未知扩展不会直接写入新项目；迁移提示要求保留原文件。不会扫描作者自由文本来猜测其中是否包含凭据，作者不应将密钥写入故事文本。

## API

健康检查、Schema、OpenAPI 与说明页可以直接读取。项目 API 要求 `/api/session` 或 `/start` 设置的 HttpOnly、SameSite=Strict 会话 Cookie；拒绝跨站来源，不开启跨域访问。界面已经通过同源入口访问服务。不要将服务暴露到外网。

| 方法与路径 | 行为 |
| --- | --- |
| GET `/api/health` | 当前批次、版本和真实能力标记 |
| GET `/api/v2/schema` | 项目 JSON Schema |
| GET `/openapi.json` | API 请求和响应契约 |
| GET `/api/workspace` | 本地目录、最近工程、无密钥连接档案 |
| POST `/api/files/new` | 指定名称、目录、文件名与模板；UI 传 `layout: folder` 创建同名目录，旧调用默认 `file` 保持单文件兼容 |
| POST `/api/v2/projects/{id}/organize` | 修订检查后，将已保存工程及有效备份复制到独立目录，继续编辑新文件，保留原文件 |
| POST `/api/v2/projects/{id}/open-folder` | 打开当前已保存工程所属的本地文件夹 |
| POST `/api/v2/projects/{id}/export-file` | 将当前修订的设计稿、对白表或工程备份写入项目 exports，不覆盖既有文件 |
| POST `/api/files/open` | 按完整路径校验、打开；旧版另存为迁移 |
| POST `/api/files/dialog` | 按 folder/open/save 弹出系统选择器；取消返回空路径 |
| POST `/api/v2/projects/{id}/save` | 修订号检查、首次保存或另存为；拒绝覆盖已有副本目标 |
| GET `/api/v2/projects/{id}/recovery` | 列出合法的上一版本及历史恢复点 |
| POST `/api/v2/projects/{id}/restore` | 按恢复点恢复并保留替换前的备份 |
| POST `/api/v2/projects/{id}/close` | 释放锁；未保存需明确放弃 |
| PUT `/api/workspace/model-profile` | 只保存接口地址与模型名，拒绝凭据字段 |
| PUT `/api/workspace/model-profiles` | 保存/选择多个无密钥连接档案，最多 30 个 |
| POST `/api/models/test` | 优先使用本次请求密钥，否则读取同接口的本机加密密钥；测试本身不保存密钥 |
| POST `/api/v2/projects/{id}/generate` | 带修订号、唯一 request_id、档案 ID、字段范围与可选预演输入启动任务；202 |
| GET `/api/v2/projects/{id}/generation` | 当前任务状态、逐项结果、失败项与实际返回用量 |
| GET `/api/v2/projects/{id}/generation/events` | SSE 状态事件与心跳；不推送凭据或未经校验的模型片段 |
| POST `/api/v2/projects/{id}/generation/{job}/cancel` | 取消正在请求/排队的项，保留已生成草稿 |
| GET `/api/v2/projects/{id}/drafts/{draft}/review` | 当前/基础/候选值、保护、冲突、过期与作者摘要 |
| POST `/api/v2/projects` | `{name, world}` 创建空白项目，返回 201 |
| GET `/api/v2/projects` | 列出内存中的项目摘要 |
| GET `/api/v2/projects/{id}` | 读取完整项目，缺失返回 404 |
| GET `/api/v2/projects/{id}/author-context` | 同一快照的完整工程与作者内容摘要，供外部 AI 生成可审核提案；要求本机会话 |
| POST `/api/v2/projects/validate` | `{document: {...}}` 校验 v2 或迁移校验 v1，不暂存 |
| POST `/api/v2/projects/import` | `{document: {...}}` 导入到内存，重复项目 ID 返回 409 |
| POST `/api/v2/projects/{id}/commands` | `{expected_revision, commands: [...]}` 原子修改 |
| POST `/api/v2/projects/{id}/simulate` | 按内容修订号计算时间、场景、分支、对白与变化日志；不写文件 |
| GET `/api/v2/projects/{id}/export` | 下载可再次导入的 UTF-8 项目 JSON |

例如新增一个角色的命令：

```json
{
  "expected_revision": 1,
  "commands": [{
    "type": "create_entity",
    "entity": {"kind": "character", "id": "my-keeper", "name": "驿站守门人"}
  }]
}
```

其他命令为 `patch_entity`、`delete_entity`、`put_relation`、`delete_relation`、`put_canvas`、`move_node`、`replace_world`、`rename_project`、`set_initial_state`、`set_legacy_preview`、`put_generation_record`、`put_simulation_case`、`delete_simulation_case`、`put_draft`、`review_draft` 和 `rebase_draft`。完整字段见生成的命令 Schema。422 错误报告不回显原始输入值。

例如重放已保存的驿站分支：

```json
{"expected_content_revision": 1, "case_id": "case-after", "at_tick": 3}
```

也可提供 `location_id`、`variable_overrides`、`choices`、`scene_changes` 覆盖该用例的输入。省略字段继承用例，显式空列表清空记录；省略 `case_id` 时使用临时分支。输入必须满足项目引用与类型规则，目标时间不能早于初始状态。内容修订号过期返回 409 `stale_simulation`，布局变化不影响预演。返回 `state`、`events`、`dialogues`、`texts`、`log`、`diagnostics`、`complete` 和执行策略，界面展示条件树与前后值。

仅查看对话入口不会执行节点效果；显式 `start`/`restart` 或选择时进入节点。选项条件、效果及目标节点条件共同决定合法跳转。无效记录整笔跳过并给出诊断，不留下半次选择的状态。解锁效果不绕过文本自身的场景与认知条件。详细顺序与边界见 [第三批交付](../docs/batch-3-delivery.md)。

## 迁移与契约生成

```powershell
backend/.venv/Scripts/python.exe -m ludo_npc.tools generate --root .
backend/.venv/Scripts/python.exe -m ludo_npc.tools generate --root . --check
backend/.venv/Scripts/python.exe -m ludo_npc.tools migrate docs/examples/lighthouse.ludo.json my-migrated.ludo.json
```

迁移命令要求输出为新文件，不覆盖已有目标。原型字段采用白名单映射，不把原始文档附加到新项目。人物、世界、关系、可见性、画布坐标、已有对白和文本得到保留。旧版“已知”备注转成事实引用，“未知”保留为不确定信息。

灯港原型中写在代码里的部分剧情被转为条件、效果和对话声明。旧信任值缺乏完整操作历史，保留为迁移快照，不冒充可回放历史；缺失发生日期的选择同样只保留快照并提示。其他世界不推断灯港隐藏逻辑。任意扩展字段不保证迁移，核对警告后再使用新文件。

生成物为 `schemas/` 下的项目/命令/OpenAPI 契约，以及 `docs/examples/` 下的空白、灯港迁移和独立荒原驿站三个 v2 示例。保留 v1 原文件用于回归。

## 本地保存与验证

主文件为 UTF-8 `.ludo.json`，保存先写同目录临时文件并刷新，再原子替换；首次保存采用独占发布，避免覆盖并发出现的目标。`.ludo.json.bak` 是上一份有效主文件，`.ludo.json.history/` 最多保留 20 个历史点。恢复会增加修订号；画布布局和文本同样可恢复。旁边的 `.lock` 文件用于操作系统单进程写锁，退出后即释放，留下空锁文件不表示还被占用。

写入前核对原文件指纹；文件被其他软件修改或删除时拒绝覆盖。窗口中编辑仍保留，可以另存副本或明确放弃后重载。单次文件当前限制 20 MB。工程没有凭据或模型连接字段；应用配置损坏不会静默覆盖原配置。原型 v1 文件打开时保留原文件，要求另存为 v2。

```powershell
Set-Location backend
.venv/Scripts/python.exe -m pytest --basetemp=.test-tmp
.venv/Scripts/python.exe -m ruff check ludo_npc tests
.venv/Scripts/python.exe -m ruff format --check ludo_npc tests
Set-Location ..
backend/.venv/Scripts/python.exe -m ludo_npc.tools generate --root . --check
npm test
npm run test:bridge
npm run build
npm run test:sites
./scripts/package-local.ps1
backend/.venv/Scripts/python.exe scripts/verify-batch-4.py
```

`.test-tmp`、`.local-build/batch-4-package-verification` 为测试专用目录，不能存个人数据。测试覆盖真实磁盘失败、进程退出、外部冲突、备份恢复和重新打开。第四批打包检查直接启动 `release/LudoNPC/LudoNPC.exe`，并启动本机协议夹具（不是模型），验证自带前端、HTTP 适配、审核、取消和中断重启。旧 `verify-package.py` 与 `verify-batch-3.py` 保留历史验收，预期对应旧批次能力，勿对新包覆盖历史报告。

第四批通过 128 项 Python 测试、17 项 Node 测试和 30 项真实程序包 HTTP 检查，见 [交付记录](../docs/batch-4-delivery.md)。Ruff、格式、依赖与契约漂移检查通过。真实服务商、系统原生选择器的完整交互与无 Python/Node 的干净 Windows 环境尚未完成验证；完整路径输入已经过浏览器验证。

## 多模型配置管理补充

远程模型请求继承运行进程的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY` 环境设置；本机模式和 localhost/回环 IP 始终直连。仍保留 HTTPS 证书校验、不跟随重定向及原有超时/重试规则。程序不会启动或修改代理软件，也不将代理参数写入项目；只有 Windows 系统代理而没有环境变量时，不保证自动读取系统代理。

服务重启后，前端遇到本地 `401 session_required` 会在原页面请求 `/api/session`，并仅重试被会话守卫拒绝的请求一次。并发请求共享恢复动作，不刷新页面、清空密钥或重复提交已执行任务。模型服务的认证失败及网络错误不走这条重试路径。兼容仍打开的旧版页面：受保护的 GET 首次仍返回 401，但设置新的 HttpOnly、SameSite=strict 本机会话 cookie，随后请求可继续；跨源请求在此前拒绝，不能恢复 cookie。

`GET /api/workspace` 返回配置列表、`active_profile_id` 和 `purpose_defaults`。`PUT /api/workspace/model-profiles` 按 ID 保存参数，保留已有通用默认；首个已启用配置成为默认。`PUT /api/workspace/model-defaults` 设置通用默认及 character/story/dialogue/text 用途默认，仅允许选择已启用配置。

`DELETE /api/workspace/model-profiles/{id}` 进行可恢复移除；`POST /api/workspace/model-profiles/{id}/restore` 恢复并启用。停用/移除会清理匹配的用途分配，通用默认选择列表中首个仍启用配置；全部停用时默认为空。配置（含已移除项）最多 30 套。最近测试记录由后端写入，连接参数改变即清空，过期测试不写入另一套参数。

生成请求仍明确提交 `profile_id`，新增可选 `purpose`；实际调用与密钥以明确选用的配置为准。新任务持久化 `profile_name`、`model_endpoint`、`purpose` 和已有模型 ID；旧 v2 记录默认缺省，向后兼容。测试用 `scripts/verify-model-configs.py` 验证已构建 exe 的多配置、密钥隔离、默认分配和重启；仅使用本机协议夹具。

## 本机加密模型密钥

Windows 通过当前用户 DPAPI 保存独立的 `credentials.json`；`settings.json` 与工程文件保持无密钥。Workspace 只返回 `credentials.supported/saved/warning`。PUT `/api/workspace/model-profiles/{id}/credential` 接收 `{api_key, endpoint}`；DELETE 同路径清除。两者受本机会话与同源保护。生成/测试的 `api_key` 留空时使用本机同目的地密钥，非空时仅覆盖该请求。接口/mode/protocol 不匹配则拒绝自动读取，复制配置不复制密钥。文件原子替换、跨进程文件锁、失败保留原文件；其他平台不做明文降级。详见 [交付说明](../docs/local-credentials-delivery.md)。
