from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspaceFile:
    relative_path: str
    absolute_path: Path


def _normalize_extensions(extensions: list[str] | None) -> set[str]:
    if not extensions:
        return {".sql"}
    out: set[str] = set()
    for e in extensions:
        s = (e or "").strip().lower()
        if not s:
            continue
        if not s.startswith("."):
            s = "." + s
        out.add(s)
    return out or {".sql"}


def list_files(workspace_dir: Path, extensions: list[str] | None = None) -> list[WorkspaceFile]:
    exts = _normalize_extensions(extensions)
    out: list[WorkspaceFile] = []
    for p in workspace_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in exts:
            continue
        rel = str(p.relative_to(workspace_dir)).replace("\\", "/")
        out.append(WorkspaceFile(relative_path=rel, absolute_path=p))
    out.sort(key=lambda x: x.relative_path)
    return out


def list_sql_files(workspace_dir: Path) -> list[WorkspaceFile]:
    return list_files(workspace_dir, [".sql"])

