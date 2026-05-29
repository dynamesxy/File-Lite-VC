from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspaceFile:
    relative_path: str
    absolute_path: Path


def list_sql_files(workspace_dir: Path) -> list[WorkspaceFile]:
    out: list[WorkspaceFile] = []
    for p in workspace_dir.rglob("*.sql"):
        if not p.is_file():
            continue
        rel = str(p.relative_to(workspace_dir)).replace("\\", "/")
        out.append(WorkspaceFile(relative_path=rel, absolute_path=p))
    out.sort(key=lambda x: x.relative_path)
    return out

