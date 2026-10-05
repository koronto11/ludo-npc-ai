from threading import RLock

from ..domain.models import Project
from .commands import CommandBatch, ProjectConflict, apply_commands


class ProjectNotFound(Exception):
    pass


class MemoryProjects:
    """Batch-one scratch store. Never presented as disk persistence."""

    def __init__(self):
        self._projects: dict[str, Project] = {}
        self._lock = RLock()

    def add(self, project: Project) -> Project:
        with self._lock:
            project = Project.model_validate(project.model_dump())
            if project.project_id in self._projects:
                raise ProjectConflict(self._projects[project.project_id].revision)
            self._projects[project.project_id] = project.model_copy(deep=True)
            return project.model_copy(deep=True)

    def get(self, project_id: str) -> Project:
        with self._lock:
            if project_id not in self._projects:
                raise ProjectNotFound("项目不存在")
            return self._projects[project_id].model_copy(deep=True)

    def list(self) -> list[Project]:
        with self._lock:
            return [project.model_copy(deep=True) for project in self._projects.values()]

    def apply(self, project_id: str, batch: CommandBatch) -> Project:
        with self._lock:
            updated = apply_commands(self.get(project_id), batch)
            self._projects[project_id] = updated.model_copy(deep=True)
            return updated.model_copy(deep=True)
