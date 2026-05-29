from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlmodel import select

from .config import get_paths
from .db import session_scope
from .models import Script, Version


def sha256_hex(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def _today_prefix() -> str:
    return datetime.utcnow().strftime("v%Y%m%d-")


def _version_actor(actor_username: str | None) -> str:
    raw = (actor_username or "").strip().lower()
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", raw).strip("-")
    return cleaned or "user"


def next_version_no(project_id: str, actor_username: str | None = None) -> str:
    prefix = f"{_today_prefix()}{_version_actor(actor_username)}-"
    with session_scope() as session:
        rows = session.exec(
            select(Version.version_no)
            .where(Version.project_id == project_id)
            .where(Version.version_no.startswith(prefix))
        ).all()
    seq = 0
    for v in rows:
        try:
            tail = v.replace(prefix, "")
            seq = max(seq, int(tail))
        except Exception:
            continue
    return f"{prefix}{seq + 1:03d}"


def upsert_script(project_id: str, relative_path: str) -> Script:
    file_name = relative_path.rsplit("/", 1)[-1]
    with session_scope() as session:
        existing = session.exec(
            select(Script).where(Script.project_id == project_id).where(Script.relative_path == relative_path)
        ).first()
        if existing:
            existing.file_name = file_name
            session.add(existing)
            session.commit()
            return existing

        sid = str(uuid.uuid4())
        s = Script(id=sid, project_id=project_id, relative_path=relative_path, file_name=file_name)
        session.add(s)
        session.commit()
        return s


@dataclass(frozen=True)
class CommitResult:
    version: Version


def commit_script(project_id: str, script_id: str, content: bytes, message: str, actor_username: str | None = None) -> CommitResult:
    paths = get_paths()
    version_id = str(uuid.uuid4())
    version_no = next_version_no(project_id=project_id, actor_username=actor_username)

    rel_snapshot = Path("snapshots") / project_id / script_id / f"{version_id}.sql"
    abs_snapshot = paths.data_dir / rel_snapshot
    abs_snapshot.parent.mkdir(parents=True, exist_ok=True)
    abs_snapshot.write_bytes(content)

    v = Version(
        id=version_id,
        project_id=project_id,
        script_id=script_id,
        version_no=version_no,
        message=message,
        snapshot_path=str(rel_snapshot).replace("\\", "/"),
        content_hash=sha256_hex(content),
    )
    with session_scope() as session:
        session.add(v)
        session.commit()
    return CommitResult(version=v)


def read_snapshot(version: Version) -> bytes:
    paths = get_paths()
    p = paths.data_dir / version.snapshot_path
    return p.read_bytes()

