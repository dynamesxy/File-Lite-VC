from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppPaths:
    data_dir: Path
    db_path: Path
    snapshots_dir: Path
    workspaces_dir: Path
    logs_dir: Path


def resolve_data_dir() -> Path:
    override = os.environ.get("SQLFTPVC_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    base = Path.home() / ".sqlftpvc"
    return base.resolve()


def get_paths() -> AppPaths:
    data_dir = resolve_data_dir()
    db_path = data_dir / "sqlftpvc.sqlite"
    snapshots_dir = data_dir / "snapshots"
    workspaces_dir = data_dir / "workspaces"
    logs_dir = data_dir / "logs"
    return AppPaths(
        data_dir=data_dir,
        db_path=db_path,
        snapshots_dir=snapshots_dir,
        workspaces_dir=workspaces_dir,
        logs_dir=logs_dir,
    )


def ensure_dirs(paths: AppPaths) -> None:
    paths.data_dir.mkdir(parents=True, exist_ok=True)
    paths.snapshots_dir.mkdir(parents=True, exist_ok=True)
    paths.workspaces_dir.mkdir(parents=True, exist_ok=True)
    paths.logs_dir.mkdir(parents=True, exist_ok=True)

