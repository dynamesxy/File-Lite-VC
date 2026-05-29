from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_paths


def create_db_engine():
    paths = get_paths()
    engine = create_engine(
        f"sqlite:///{paths.db_path}",
        connect_args={"check_same_thread": False},
    )
    return engine


engine = create_db_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_schema()


def _has_column(conn, table: str, col: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == col for r in rows)


def _ensure_schema() -> None:
    with engine.begin() as conn:
        if not _has_column(conn, "versions", "project_id"):
            conn.exec_driver_sql("ALTER TABLE versions ADD COLUMN project_id TEXT")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id)")


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

