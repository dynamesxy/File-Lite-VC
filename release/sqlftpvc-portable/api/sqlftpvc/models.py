from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


class Project(SQLModel, table=True):
    __tablename__ = "projects"

    id: str = Field(primary_key=True)
    name: str
    local_workspace_path: str
    remote_path: str
    created_at: str = Field(default_factory=now_iso)


class Script(SQLModel, table=True):
    __tablename__ = "scripts"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    relative_path: str
    file_name: str
    updated_at: str = Field(default_factory=now_iso)


class Version(SQLModel, table=True):
    __tablename__ = "versions"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    script_id: str = Field(index=True)
    version_no: str = Field(index=True)
    message: str
    snapshot_path: str
    content_hash: str
    created_at: str = Field(default_factory=now_iso, index=True)


class FtpSetting(SQLModel, table=True):
    __tablename__ = "ftp_settings"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    host: str
    port: int
    username: str
    password_enc: str
    passive_mode: bool
    remote_root: str


class EventLog(SQLModel, table=True):
    __tablename__ = "event_logs"

    id: str = Field(primary_key=True)
    project_id: Optional[str] = Field(default=None, index=True)
    action: str
    result: str
    detail: str
    created_at: str = Field(default_factory=now_iso, index=True)

