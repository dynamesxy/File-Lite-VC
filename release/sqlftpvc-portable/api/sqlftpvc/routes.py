from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from .db import session_scope
from .ftp import FtpConfig, connect, decode_sql_bytes, download_bytes, list_sql_files, remote_join, test_connection, upload_bytes
from .models import EventLog, FtpSetting, Project, Script, Version
from .security import decrypt_text, encrypt_text
from .diffing import compute_side_by_side
from .versioning import commit_script, read_snapshot, sha256_hex, upsert_script
from .workspace import list_sql_files as list_workspace_sql


api_router = APIRouter(prefix="/api")


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    localWorkspacePath: str
    remotePath: str


class ProjectOut(BaseModel):
    id: str
    name: str
    localWorkspacePath: str
    remotePath: str
    createdAt: str


class FtpConfigIn(BaseModel):
    host: str
    port: int = 21
    username: str
    password: str
    passiveMode: bool = True
    remoteRoot: str = "/"


class FtpSettingOut(BaseModel):
    host: str
    port: int
    username: str
    passiveMode: bool
    remoteRoot: str


class PullPushIn(BaseModel):
    dryRun: bool = True
    overwrite: bool = False
    paths: list[str] | None = None


class FileStatus(BaseModel):
    relativePath: str
    status: str
    localExists: bool
    remoteExists: bool
    diffPreview: str | None = None


class PullPushOut(BaseModel):
    files: list[FileStatus]


class ScriptOut(BaseModel):
    id: str
    projectId: str
    relativePath: str
    fileName: str
    latestVersionNo: str | None
    latestVersionId: str | None
    hasUncommittedChanges: bool


class VersionOut(BaseModel):
    id: str
    scriptId: str
    versionNo: str
    message: str
    createdAt: str


class CommitIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


@api_router.get("/diff")
def diff(
    leftVersionId: str | None = None,
    rightVersionId: str | None = None,
    workspaceScriptId: str | None = None,
):
    if leftVersionId and rightVersionId:
        with session_scope() as session:
            lv = session.get(Version, leftVersionId)
            rv = session.get(Version, rightVersionId)
            if not lv or not rv:
                raise HTTPException(status_code=404, detail="version not found")
        left_text = decode_sql_bytes(read_snapshot(lv))
        right_text = decode_sql_bytes(read_snapshot(rv))
        return {
            "left": {"kind": "version", "id": lv.id, "versionNo": lv.version_no},
            "right": {"kind": "version", "id": rv.id, "versionNo": rv.version_no},
            **compute_side_by_side(left_text, right_text),
        }

    if workspaceScriptId and rightVersionId:
        with session_scope() as session:
            s = session.get(Script, workspaceScriptId)
            rv = session.get(Version, rightVersionId)
            if not s or not rv:
                raise HTTPException(status_code=404, detail="script/version not found")
            proj = session.get(Project, s.project_id)
            if not proj:
                raise HTTPException(status_code=404, detail="project not found")

        workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
        fp = (workspace_dir / s.relative_path).resolve()
        if not fp.exists() or not fp.is_file():
            raise HTTPException(status_code=400, detail="file not found in workspace")
        left_text = decode_sql_bytes(fp.read_bytes())
        right_text = decode_sql_bytes(read_snapshot(rv))
        return {
            "left": {"kind": "workspace", "scriptId": s.id, "relativePath": s.relative_path},
            "right": {"kind": "version", "id": rv.id, "versionNo": rv.version_no},
            **compute_side_by_side(left_text, right_text),
        }

    raise HTTPException(status_code=400, detail="invalid diff params")


def _log(project_id: str | None, action: str, result: str, detail: str) -> None:
    with session_scope() as session:
        session.add(
            EventLog(
                id=str(uuid.uuid4()),
                project_id=project_id,
                action=action,
                result=result,
                detail=detail,
            )
        )
        session.commit()


def _get_project(project_id: str) -> Project:
    with session_scope() as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        return p


def _get_ftp_setting(project_id: str) -> FtpSetting:
    with session_scope() as session:
        st = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if not st:
            raise HTTPException(status_code=400, detail="ftp setting not configured")
        return st


def _setting_to_cfg(st: FtpSetting) -> FtpConfig:
    return FtpConfig(
        host=st.host,
        port=st.port,
        username=st.username,
        password=decrypt_text(st.password_enc),
        passive_mode=st.passive_mode,
        remote_root=st.remote_root,
    )


@api_router.get("/projects", response_model=list[ProjectOut])
def list_projects():
    with session_scope() as session:
        rows = session.exec(select(Project).order_by(Project.created_at.desc())).all()
    return [
        ProjectOut(
            id=r.id,
            name=r.name,
            localWorkspacePath=r.local_workspace_path,
            remotePath=r.remote_path,
            createdAt=r.created_at,
        )
        for r in rows
    ]


@api_router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate):
    pid = str(uuid.uuid4())
    p = Project(
        id=pid,
        name=body.name,
        local_workspace_path=body.localWorkspacePath,
        remote_path=body.remotePath,
    )
    with session_scope() as session:
        session.add(p)
        session.commit()
    _log(pid, "project.create", "ok", body.name)
    return ProjectOut(
        id=p.id,
        name=p.name,
        localWorkspacePath=p.local_workspace_path,
        remotePath=p.remote_path,
        createdAt=p.created_at,
    )


@api_router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    with session_scope() as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        session.delete(p)
        session.commit()
    _log(project_id, "project.delete", "ok", "")
    return {"ok": True}


@api_router.post("/ftp/test")
def ftp_test(body: FtpConfigIn):
    cfg = FtpConfig(
        host=body.host,
        port=body.port,
        username=body.username,
        password=body.password,
        passive_mode=body.passiveMode,
        remote_root=body.remoteRoot,
    )
    try:
        return test_connection(cfg)
    except Exception as e:
        _log(None, "ftp.test", "error", str(e))
        raise HTTPException(status_code=400, detail=str(e))


@api_router.put("/projects/{project_id}/ftp", response_model=FtpSettingOut)
def upsert_ftp_setting(project_id: str, body: FtpConfigIn):
    _get_project(project_id)
    sid = str(uuid.uuid4())
    enc = encrypt_text(body.password)
    with session_scope() as session:
        existing = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if existing:
            existing.host = body.host
            existing.port = body.port
            existing.username = body.username
            existing.password_enc = enc
            existing.passive_mode = body.passiveMode
            existing.remote_root = body.remoteRoot
            session.add(existing)
        else:
            session.add(
                FtpSetting(
                    id=sid,
                    project_id=project_id,
                    host=body.host,
                    port=body.port,
                    username=body.username,
                    password_enc=enc,
                    passive_mode=body.passiveMode,
                    remote_root=body.remoteRoot,
                )
            )
        session.commit()
    _log(project_id, "ftp.save", "ok", f"{body.host}:{body.port}")
    return FtpSettingOut(
        host=body.host,
        port=body.port,
        username=body.username,
        passiveMode=body.passiveMode,
        remoteRoot=body.remoteRoot,
    )


def _get_latest_version(script_id: str) -> Version | None:
    with session_scope() as session:
        v = session.exec(
            select(Version).where(Version.script_id == script_id).order_by(Version.created_at.desc())
        ).first()
        return v


@api_router.get("/projects/{project_id}/scripts", response_model=list[ScriptOut])
def list_project_scripts(project_id: str):
    proj = _get_project(project_id)
    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    files = list_workspace_sql(workspace_dir)
    out: list[ScriptOut] = []
    for f in files:
        s = upsert_script(project_id, f.relative_path)
        data = f.absolute_path.read_bytes()
        latest = _get_latest_version(s.id)
        latest_no = latest.version_no if latest else None
        latest_id = latest.id if latest else None
        has_changes = True
        if latest:
            has_changes = sha256_hex(data) != latest.content_hash

        out.append(
            ScriptOut(
                id=s.id,
                projectId=s.project_id,
                relativePath=s.relative_path,
                fileName=s.file_name,
                latestVersionNo=latest_no,
                latestVersionId=latest_id,
                hasUncommittedChanges=has_changes,
            )
        )
    return out


@api_router.get("/scripts/{script_id}/versions", response_model=list[VersionOut])
def list_versions(script_id: str):
    with session_scope() as session:
        s = session.get(Script, script_id)
        if not s:
            raise HTTPException(status_code=404, detail="script not found")
        versions = session.exec(
            select(Version).where(Version.script_id == script_id).order_by(Version.created_at.desc())
        ).all()
    return [
        VersionOut(
            id=v.id,
            scriptId=v.script_id,
            versionNo=v.version_no,
            message=v.message,
            createdAt=v.created_at,
        )
        for v in versions
    ]


@api_router.post("/scripts/{script_id}/commit", response_model=VersionOut)
def commit(script_id: str, body: CommitIn):
    with session_scope() as session:
        s = session.get(Script, script_id)
        if not s:
            raise HTTPException(status_code=404, detail="script not found")
        proj = session.get(Project, s.project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="project not found")

    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    fp = (workspace_dir / s.relative_path).resolve()
    if not fp.exists() or not fp.is_file():
        raise HTTPException(status_code=400, detail="file not found in workspace")

    content = fp.read_bytes()
    latest = _get_latest_version(script_id)
    if latest and sha256_hex(content) == latest.content_hash:
        raise HTTPException(status_code=409, detail="no changes to commit")
    r = commit_script(project_id=s.project_id, script_id=script_id, content=content, message=body.message)
    _log(s.project_id, "version.commit", "ok", f"{s.relative_path} {r.version.version_no}")
    return VersionOut(
        id=r.version.id,
        scriptId=r.version.script_id,
        versionNo=r.version.version_no,
        message=r.version.message,
        createdAt=r.version.created_at,
    )


@api_router.get("/versions/{version_id}/content")
def version_content(version_id: str):
    with session_scope() as session:
        v = session.get(Version, version_id)
        if not v:
            raise HTTPException(status_code=404, detail="version not found")
    data = read_snapshot(v)
    return {
        "id": v.id,
        "scriptId": v.script_id,
        "projectId": v.project_id,
        "versionNo": v.version_no,
        "message": v.message,
        "createdAt": v.created_at,
        "content": decode_sql_bytes(data),
    }


@api_router.get("/logs")
def logs(projectId: str | None = None, limit: int = 200):
    limit2 = max(1, min(limit, 500))
    with session_scope() as session:
        q = select(EventLog).order_by(EventLog.created_at.desc())
        if projectId:
            q = q.where(EventLog.project_id == projectId)
        rows = session.exec(q.limit(limit2)).all()
    return [
        {
            "id": r.id,
            "projectId": r.project_id,
            "action": r.action,
            "result": r.result,
            "detail": r.detail,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


def _read_local_bytes(workspace_dir: Path, rel: str) -> bytes | None:
    p = (workspace_dir / rel).resolve()
    if not p.exists() or not p.is_file():
        return None
    try:
        return p.read_bytes()
    except Exception:
        return None


def _write_local_bytes(workspace_dir: Path, rel: str, data: bytes) -> None:
    p = (workspace_dir / rel).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def _unified_preview(a: str, b: str, limit_lines: int = 200) -> str:
    import difflib

    lines = list(
        difflib.unified_diff(
            a.splitlines(keepends=True),
            b.splitlines(keepends=True),
            fromfile="local",
            tofile="remote",
        )
    )
    if len(lines) > limit_lines:
        head = lines[:limit_lines]
        head.append(f"... (diff truncated, total {len(lines)} lines)\n")
        return "".join(head)
    return "".join(lines)


@api_router.post("/projects/{project_id}/pull", response_model=PullPushOut)
def pull_from_ftp(project_id: str, body: PullPushIn):
    proj = _get_project(project_id)
    st = _get_ftp_setting(project_id)
    cfg = _setting_to_cfg(st)

    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    remote_dir = remote_join(cfg.remote_root, proj.remote_path)

    ftp = connect(cfg)
    try:
        rels = list_sql_files(ftp, remote_dir)
        results: list[FileStatus] = []

        for rel in rels:
            if body.paths and rel not in body.paths:
                continue

            remote_path = remote_join(remote_dir, rel)
            remote_bytes = download_bytes(ftp, remote_path)
            local_bytes = _read_local_bytes(workspace_dir, rel)
            local_exists = local_bytes is not None
            remote_exists = True

            status = "new" if not local_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            if status in ("modified", "new"):
                diff_preview = _unified_preview(
                    decode_sql_bytes(local_bytes or b""),
                    decode_sql_bytes(remote_bytes),
                )

            if not body.dryRun:
                if status == "new" or (status == "modified" and body.overwrite):
                    _write_local_bytes(workspace_dir, rel, remote_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status,
                    localExists=local_exists,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                )
            )

        _log(project_id, "ftp.pull", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} files={len(results)}")
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, "ftp.pull", "error", str(e))
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


@api_router.post("/projects/{project_id}/push", response_model=PullPushOut)
def push_to_ftp(project_id: str, body: PullPushIn):
    proj = _get_project(project_id)
    st = _get_ftp_setting(project_id)
    cfg = _setting_to_cfg(st)

    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    remote_dir = remote_join(cfg.remote_root, proj.remote_path)

    local_files: list[str] = []
    for p in workspace_dir.rglob("*.sql"):
        if p.is_file():
            rel = str(p.relative_to(workspace_dir)).replace("\\", "/")
            local_files.append(rel)
    local_files.sort()

    ftp = connect(cfg)
    try:
        remote_rels = set(list_sql_files(ftp, remote_dir))
        results: list[FileStatus] = []

        for rel in local_files:
            if body.paths and rel not in body.paths:
                continue

            local_bytes = _read_local_bytes(workspace_dir, rel)
            if local_bytes is None:
                continue

            remote_path = remote_join(remote_dir, rel)
            remote_exists = rel in remote_rels
            remote_bytes = b""
            if remote_exists:
                try:
                    remote_bytes = download_bytes(ftp, remote_path)
                except Exception:
                    remote_exists = False
                    remote_bytes = b""

            status = "new" if not remote_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            if status in ("modified", "new"):
                diff_preview = _unified_preview(
                    decode_sql_bytes(remote_bytes),
                    decode_sql_bytes(local_bytes),
                )

            if not body.dryRun:
                if status == "new" or (status == "modified" and body.overwrite):
                    upload_bytes(ftp, remote_path, local_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status,
                    localExists=True,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                )
            )

        _log(project_id, "ftp.push", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} files={len(results)}")
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, "ftp.push", "error", str(e))
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()

