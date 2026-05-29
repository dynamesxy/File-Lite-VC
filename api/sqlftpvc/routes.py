from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import select

from .config import get_paths
from .db import session_scope
from .diffing import compute_side_by_side
from .fs_dialog import pick_directory
from .ftp import (
    FtpConfig,
    connect,
    decode_sql_bytes,
    download_bytes,
    list_dirs,
    list_sql_files,
    remote_join,
    test_connection,
    upload_bytes,
)
from .models import EventLog, FtpSetting, Project, Script, User, UserSession, Version
from .runtime_log import log_error, log_info
from .security import (
    decrypt_text,
    encrypt_text,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from .versioning import commit_script, read_snapshot, sha256_hex, upsert_script
from .workspace import list_sql_files as list_workspace_sql


api_router = APIRouter(prefix="/api")
SESSION_COOKIE_NAME = "sqlftpvc_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60


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


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    localWorkspacePath: str | None = None
    remotePath: str | None = None


class ProjectBatchDeleteIn(BaseModel):
    projectIds: list[str] = Field(min_length=1)


class FtpConfigIn(BaseModel):
    host: str
    port: int = 21
    username: str
    password: str
    passiveMode: bool = True
    remoteRoot: str = "/"
    ftpEncoding: str = "auto"


class FtpSettingOut(BaseModel):
    host: str
    port: int
    username: str
    passiveMode: bool
    remoteRoot: str
    ftpEncoding: str


class FtpSettingFullOut(BaseModel):
    host: str
    port: int
    username: str
    password: str
    passiveMode: bool
    remoteRoot: str
    ftpEncoding: str


class FtpBrowseOut(BaseModel):
    path: str
    dirs: list[dict]


class PullPushIn(BaseModel):
    dryRun: bool = True
    overwrite: bool = False
    paths: list[str] | None = None


class PickDirectoryOut(BaseModel):
    path: str


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


class RegisterIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    username: str
    createdAt: str


class RollbackIn(BaseModel):
    message: str | None = Field(default=None, max_length=500)


class RollbackOut(BaseModel):
    ok: bool
    targetVersionId: str
    targetVersionNo: str
    publishedRemotePath: str
    workspacePath: str
    createdVersionId: str | None = None
    createdVersionNo: str | None = None
    message: str


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _expires_at_iso() -> str:
    return (datetime.utcnow() + timedelta(seconds=SESSION_MAX_AGE)).replace(microsecond=0).isoformat() + "Z"


def _normalize_username(username: str) -> str:
    return username.strip()


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, username=user.username, createdAt=user.created_at)


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def _delete_session_by_token(session_token: str | None) -> None:
    if not session_token:
        return
    token_hash = hash_session_token(session_token)
    with session_scope() as session:
        row = session.exec(select(UserSession).where(UserSession.token_hash == token_hash)).first()
        if row:
            session.delete(row)
            session.commit()


def _load_user_by_session_token(session_token: str | None) -> User | None:
    if not session_token:
        return None
    token_hash = hash_session_token(session_token)
    now = _now_iso()
    with session_scope() as session:
        row = session.exec(select(UserSession).where(UserSession.token_hash == token_hash)).first()
        if not row:
            return None
        if row.expires_at <= now:
            session.delete(row)
            session.commit()
            return None
        user = session.get(User, row.user_id)
        if not user:
            session.delete(row)
            session.commit()
            return None
        return user


def get_current_user(session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> User | None:
    return _load_user_by_session_token(session_token)


def require_user(session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> User:
    user = _load_user_by_session_token(session_token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    return user


CurrentUser = Annotated[User, Depends(require_user)]


def _create_user_session(user: User, response: Response) -> None:
    token = generate_session_token()
    token_hash = hash_session_token(token)
    with session_scope() as session:
        session.add(
            UserSession(
                id=str(uuid.uuid4()),
                user_id=user.id,
                token_hash=token_hash,
                expires_at=_expires_at_iso(),
            )
        )
        session.commit()
    _set_session_cookie(response, token)


def _log(project_id: str | None, action: str, result: str, detail: str, actor: User | None = None) -> None:
    actor_name = actor.username if actor else "-"
    message = (
        f"actor={actor_name} action={action} result={result} "
        f"projectId={project_id or '-'} detail={detail}"
    )
    if result == "error":
        log_error(message)
    else:
        log_info(message)
    with session_scope() as session:
        session.add(
            EventLog(
                id=str(uuid.uuid4()),
                project_id=project_id,
                actor_user_id=actor.id if actor else None,
                actor_username=actor.username if actor else None,
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


def _delete_project(project_id: str) -> None:
    with session_scope() as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")

        versions = session.exec(select(Version).where(Version.project_id == project_id)).all()
        scripts = session.exec(select(Script).where(Script.project_id == project_id)).all()
        ftp = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).all()
        logs = session.exec(select(EventLog).where(EventLog.project_id == project_id)).all()

        for v in versions:
            session.delete(v)
        for s in scripts:
            session.delete(s)
        for st in ftp:
            session.delete(st)
        for lg in logs:
            session.delete(lg)

        session.delete(p)
        session.commit()

    try:
        paths = get_paths()
        snap_dir = paths.data_dir / "snapshots" / project_id
        if snap_dir.exists():
            shutil.rmtree(snap_dir, ignore_errors=True)
    except Exception:
        pass


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
        ftp_encoding=getattr(st, "ftp_encoding", "auto") or "auto",
    )


def _resolve_project_remote_dir(cfg: FtpConfig, project_remote_path: str) -> str:
    if project_remote_path and project_remote_path.strip().startswith("/"):
        return remote_join(project_remote_path)
    return remote_join(cfg.remote_root, project_remote_path)


def _get_latest_version(script_id: str) -> Version | None:
    with session_scope() as session:
        v = session.exec(
            select(Version).where(Version.script_id == script_id).order_by(Version.created_at.desc())
        ).first()
        return v


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


def _summarize_files(results: list[FileStatus]) -> str:
    changed = [f"{row.relativePath}:{row.status}" for row in results if row.status != "unchanged"]
    preview = ", ".join(changed[:10]) if changed else "-"
    if len(changed) > 10:
        preview += f", ...(+{len(changed) - 10})"
    return f"files={len(results)} changed={len(changed)} paths={preview}"


@api_router.post("/auth/register", response_model=UserOut)
def register(body: RegisterIn, response: Response):
    username = _normalize_username(body.username)
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")

    with session_scope() as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            raise HTTPException(status_code=409, detail="用户名已存在")
        user = User(id=str(uuid.uuid4()), username=username, password_hash=hash_password(body.password))
        session.add(user)
        session.commit()

    _create_user_session(user, response)
    _log(None, "auth.register", "ok", f"username={user.username}", actor=user)
    return _user_out(user)


@api_router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, response: Response):
    username = _normalize_username(body.username)
    with session_scope() as session:
        user = session.exec(select(User).where(User.username == username)).first()
    if not user or not verify_password(body.password, user.password_hash):
        _log(None, "auth.login", "error", f"username={username}")
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    _create_user_session(user, response)
    _log(None, "auth.login", "ok", f"username={user.username}", actor=user)
    return _user_out(user)


@api_router.post("/auth/logout")
def logout(response: Response, session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME), current_user: User | None = Depends(get_current_user)):
    _delete_session_by_token(session_token)
    _clear_session_cookie(response)
    if current_user:
        _log(None, "auth.logout", "ok", f"username={current_user.username}", actor=current_user)
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserOut)
def me(current_user: CurrentUser):
    return _user_out(current_user)


@api_router.get("/diff")
def diff(
    current_user: CurrentUser,
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


@api_router.get("/projects", response_model=list[ProjectOut])
def list_projects(current_user: CurrentUser):
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
def create_project(body: ProjectCreate, current_user: CurrentUser):
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
    _log(pid, "project.create", "ok", body.name, actor=current_user)
    return ProjectOut(
        id=p.id,
        name=p.name,
        localWorkspacePath=p.local_workspace_path,
        remotePath=p.remote_path,
        createdAt=p.created_at,
    )


@api_router.delete("/projects/{project_id}")
def delete_project(project_id: str, current_user: CurrentUser):
    _delete_project(project_id)
    _log(project_id, "project.delete", "ok", "", actor=current_user)
    return {"ok": True}


@api_router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate, current_user: CurrentUser):
    with session_scope() as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        if body.name is not None:
            p.name = body.name
        if body.localWorkspacePath is not None:
            p.local_workspace_path = body.localWorkspacePath
        if body.remotePath is not None:
            p.remote_path = body.remotePath
        session.add(p)
        session.commit()
    _log(project_id, "project.update", "ok", "", actor=current_user)
    return ProjectOut(
        id=p.id,
        name=p.name,
        localWorkspacePath=p.local_workspace_path,
        remotePath=p.remote_path,
        createdAt=p.created_at,
    )


@api_router.post("/projects/batch-delete")
def batch_delete_projects(body: ProjectBatchDeleteIn, current_user: CurrentUser):
    for pid in body.projectIds:
        _delete_project(pid)
        _log(pid, "project.delete", "ok", "batch", actor=current_user)
    return {"ok": True}


@api_router.post("/ftp/test")
def ftp_test(body: FtpConfigIn, current_user: CurrentUser):
    cfg = FtpConfig(
        host=body.host,
        port=body.port,
        username=body.username,
        password=body.password,
        passive_mode=body.passiveMode,
        remote_root=body.remoteRoot,
        ftp_encoding=body.ftpEncoding,
    )
    try:
        result = test_connection(cfg)
        _log(None, "ftp.test", "ok", f"{body.host}:{body.port}", actor=current_user)
        return result
    except Exception as e:
        _log(None, "ftp.test", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/ftp/browse", response_model=FtpBrowseOut)
def ftp_browse(body: FtpConfigIn, current_user: CurrentUser, path: str = "/"):
    cfg = FtpConfig(
        host=body.host,
        port=body.port,
        username=body.username,
        password=body.password,
        passive_mode=body.passiveMode,
        remote_root=body.remoteRoot,
        ftp_encoding=body.ftpEncoding,
    )
    ftp = connect(cfg)
    try:
        root_norm = remote_join(cfg.remote_root)
        target = remote_join(cfg.remote_root, path)
        dirs = list_dirs(ftp, target)
        out_dirs: list[dict] = []
        for d in dirs:
            rel = d.path
            if rel.startswith(root_norm):
                rel = rel[len(root_norm) :] or "/"
            if not rel.startswith("/"):
                rel = "/" + rel
            out_dirs.append({"name": d.name, "path": rel})
        _log(None, "ftp.browse", "ok", f"path={path} dirs={len(out_dirs)}", actor=current_user)
        return {"path": path, "dirs": out_dirs}
    except Exception as e:
        _log(None, "ftp.browse", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


@api_router.put("/projects/{project_id}/ftp", response_model=FtpSettingOut)
def upsert_ftp_setting(project_id: str, body: FtpConfigIn, current_user: CurrentUser):
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
            existing.ftp_encoding = body.ftpEncoding
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
                    ftp_encoding=body.ftpEncoding,
                )
            )
        session.commit()
    _log(project_id, "ftp.save", "ok", f"{body.host}:{body.port}", actor=current_user)
    return FtpSettingOut(
        host=body.host,
        port=body.port,
        username=body.username,
        passiveMode=body.passiveMode,
        remoteRoot=body.remoteRoot,
        ftpEncoding=body.ftpEncoding,
    )


@api_router.get("/projects/{project_id}/ftp", response_model=FtpSettingFullOut)
def get_ftp_setting(project_id: str, current_user: CurrentUser):
    st = _get_ftp_setting(project_id)
    return FtpSettingFullOut(
        host=st.host,
        port=st.port,
        username=st.username,
        password=decrypt_text(st.password_enc),
        passiveMode=st.passive_mode,
        remoteRoot=st.remote_root,
        ftpEncoding=getattr(st, "ftp_encoding", "auto") or "auto",
    )


@api_router.post("/fs/pick-directory", response_model=PickDirectoryOut)
def fs_pick_directory(current_user: CurrentUser, initial: str | None = None):
    p = pick_directory(initial)
    if not p:
        raise HTTPException(status_code=400, detail="no directory selected")
    _log(None, "fs.pick_directory", "ok", p, actor=current_user)
    return {"path": p}


@api_router.get("/projects/{project_id}/scripts", response_model=list[ScriptOut])
def list_project_scripts(project_id: str, current_user: CurrentUser):
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
def list_versions(script_id: str, current_user: CurrentUser):
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
def commit(script_id: str, body: CommitIn, current_user: CurrentUser):
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
    r = commit_script(
        project_id=s.project_id,
        script_id=script_id,
        content=content,
        message=body.message,
        actor_username=current_user.username,
    )
    _log(s.project_id, "version.commit", "ok", f"{s.relative_path} {r.version.version_no}", actor=current_user)
    return VersionOut(
        id=r.version.id,
        scriptId=r.version.script_id,
        versionNo=r.version.version_no,
        message=r.version.message,
        createdAt=r.version.created_at,
    )


@api_router.get("/versions/{version_id}/content")
def version_content(version_id: str, current_user: CurrentUser):
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


@api_router.post("/versions/{version_id}/rollback-to-ftp", response_model=RollbackOut)
def rollback_version_to_ftp(version_id: str, body: RollbackIn, current_user: CurrentUser):
    with session_scope() as session:
        target = session.get(Version, version_id)
        if not target:
            raise HTTPException(status_code=404, detail="version not found")
        script = session.get(Script, target.script_id)
        if not script:
            raise HTTPException(status_code=404, detail="script not found")
        proj = session.get(Project, target.project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="project not found")

    st = _get_ftp_setting(proj.id)
    cfg = _setting_to_cfg(st)
    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    data = read_snapshot(target)
    workspace_path = str((workspace_dir / script.relative_path).resolve())
    remote_dir = _resolve_project_remote_dir(cfg, proj.remote_path)
    remote_path = remote_join(remote_dir, script.relative_path)

    ftp = None
    try:
        _write_local_bytes(workspace_dir, script.relative_path, data)
        ftp = connect(cfg)
        upload_bytes(ftp, remote_path, data)

        latest = _get_latest_version(script.id)
        created_version = None
        if not latest or sha256_hex(data) != latest.content_hash:
            rollback_message = body.message.strip() if body.message and body.message.strip() else f"回退到 {target.version_no}"
            created_version = commit_script(
                project_id=proj.id,
                script_id=script.id,
                content=data,
                message=rollback_message,
                actor_username=current_user.username,
            ).version

        detail = (
            f"{script.relative_path} rollbackTo={target.version_no} remote={remote_path} "
            f"createdVersion={created_version.version_no if created_version else '-'}"
        )
        _log(proj.id, "version.rollback.publish", "ok", detail, actor=current_user)
        return RollbackOut(
            ok=True,
            targetVersionId=target.id,
            targetVersionNo=target.version_no,
            publishedRemotePath=remote_path,
            workspacePath=workspace_path,
            createdVersionId=created_version.id if created_version else None,
            createdVersionNo=created_version.version_no if created_version else None,
            message=f"已回退到 {target.version_no} 并发布到 FTP",
        )
    except Exception as e:
        _log(proj.id, "version.rollback.publish", "error", f"versionId={version_id} error={e}", actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if ftp:
            try:
                ftp.quit()
            except Exception:
                ftp.close()


@api_router.get("/logs")
def logs(
    current_user: CurrentUser,
    projectId: str | None = None,
    actorUsername: str | None = None,
    action: str | None = None,
    result: str | None = None,
    startAt: str | None = None,
    endAt: str | None = None,
    offset: int = 0,
    limit: int = 200,
):
    limit2 = max(1, min(limit, 500))
    offset2 = max(0, offset)
    with session_scope() as session:
        q = select(EventLog)
        if projectId:
            q = q.where(EventLog.project_id == projectId)
        if actorUsername:
            q = q.where(EventLog.actor_username.contains(actorUsername))
        if action:
            q = q.where(EventLog.action == action)
        if result:
            q = q.where(EventLog.result == result)
        if startAt:
            q = q.where(EventLog.created_at >= startAt)
        if endAt:
            q = q.where(EventLog.created_at <= endAt)

        rows_all = session.exec(q.order_by(EventLog.created_at.desc())).all()
        rows = rows_all[offset2 : offset2 + limit2]

    return {
        "items": [
            {
                "id": r.id,
                "projectId": r.project_id,
                "actorUserId": r.actor_user_id,
                "actorUsername": r.actor_username,
                "action": r.action,
                "result": r.result,
                "detail": r.detail,
                "createdAt": r.created_at,
            }
            for r in rows
        ],
        "total": len(rows_all),
        "offset": offset2,
        "limit": limit2,
    }


@api_router.post("/projects/{project_id}/pull", response_model=PullPushOut)
def pull_from_ftp(project_id: str, body: PullPushIn, current_user: CurrentUser):
    proj = _get_project(project_id)
    st = _get_ftp_setting(project_id)
    cfg = _setting_to_cfg(st)

    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    remote_dir = _resolve_project_remote_dir(cfg, proj.remote_path)
    log_info(
        "ftp.pull.start "
        f"projectId={project_id} remoteRoot={cfg.remote_root} projectRemote={proj.remote_path} "
        f"resolvedRemoteDir={remote_dir} dryRun={body.dryRun} overwrite={body.overwrite}"
    )

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

            status_name = "new" if not local_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            if status_name in ("modified", "new"):
                diff_preview = _unified_preview(
                    decode_sql_bytes(local_bytes or b""),
                    decode_sql_bytes(remote_bytes),
                )

            if not body.dryRun:
                if status_name == "new" or (status_name == "modified" and body.overwrite):
                    _write_local_bytes(workspace_dir, rel, remote_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status_name,
                    localExists=local_exists,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                )
            )

        _log(project_id, "ftp.pull", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} {_summarize_files(results)}", actor=current_user)
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, "ftp.pull", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


@api_router.post("/projects/{project_id}/push", response_model=PullPushOut)
def push_to_ftp(project_id: str, body: PullPushIn, current_user: CurrentUser):
    proj = _get_project(project_id)
    st = _get_ftp_setting(project_id)
    cfg = _setting_to_cfg(st)

    workspace_dir = Path(proj.local_workspace_path).expanduser().resolve()
    if not workspace_dir.exists():
        raise HTTPException(status_code=400, detail="local workspace path does not exist")

    remote_dir = _resolve_project_remote_dir(cfg, proj.remote_path)
    log_info(
        "ftp.push.start "
        f"projectId={project_id} remoteRoot={cfg.remote_root} projectRemote={proj.remote_path} "
        f"resolvedRemoteDir={remote_dir} dryRun={body.dryRun} overwrite={body.overwrite}"
    )

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

            status_name = "new" if not remote_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            if status_name in ("modified", "new"):
                diff_preview = _unified_preview(
                    decode_sql_bytes(remote_bytes),
                    decode_sql_bytes(local_bytes),
                )

            if not body.dryRun:
                if status_name == "new" or (status_name == "modified" and body.overwrite):
                    upload_bytes(ftp, remote_path, local_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status_name,
                    localExists=True,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                )
            )

        _log(project_id, "ftp.push", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} {_summarize_files(results)}", actor=current_user)
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, "ftp.push", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()
