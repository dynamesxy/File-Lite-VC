from __future__ import annotations

import shutil
import json
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
from .models import FtpProfile
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
from .workspace import list_files as list_workspace_files


api_router = APIRouter(prefix="/api")
SESSION_COOKIE_NAME = "sqlftpvc_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    localWorkspacePath: str | None = None
    localWorkspacePaths: list[str] | None = None
    remotePath: str
    scriptExtensions: list[str] | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    localWorkspacePath: str
    localWorkspacePaths: list[str]
    remotePath: str
    scriptExtensions: list[str]
    createdAt: str


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    localWorkspacePath: str | None = None
    localWorkspacePaths: list[str] | None = None
    remotePath: str | None = None
    scriptExtensions: list[str] | None = None


class ProjectBatchDeleteIn(BaseModel):
    projectIds: list[str] = Field(min_length=1)


class FtpConfigIn(BaseModel):
    connectionMode: str = "ftp"
    ftpProfileId: str | None = None
    host: str
    port: int = 21
    username: str
    password: str
    passiveMode: bool = True
    remoteRoot: str = "/"
    ftpEncoding: str = "auto"


class FtpSettingOut(BaseModel):
    connectionMode: str
    ftpProfileId: str | None = None
    host: str
    port: int
    username: str
    passiveMode: bool
    remoteRoot: str
    ftpEncoding: str


class FtpSettingFullOut(BaseModel):
    connectionMode: str
    ftpProfileId: str | None = None
    host: str
    port: int
    username: str
    password: str
    passiveMode: bool
    remoteRoot: str
    ftpEncoding: str


class FtpProfileOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    username: str
    passiveMode: bool
    remoteRoot: str
    ftpEncoding: str
    createdAt: str


class FtpProfileFullOut(FtpProfileOut):
    password: str


class FtpProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    host: str
    port: int = 21
    username: str
    password: str
    passiveMode: bool = True
    remoteRoot: str = "/"
    ftpEncoding: str = "auto"


class FtpBrowseOut(BaseModel):
    path: str
    dirs: list[dict]


class PullPushIn(BaseModel):
    dryRun: bool = True
    overwrite: bool = False
    paths: list[str] | None = None
    conflictSelections: dict[str, list[str]] | None = None


class ConflictLineOut(BaseModel):
    index: int
    localNo: int | None
    remoteNo: int | None
    localText: str
    remoteText: str
    selectedSide: str


class PickDirectoryOut(BaseModel):
    path: str


class FileStatus(BaseModel):
    relativePath: str
    status: str
    localExists: bool
    remoteExists: bool
    diffPreview: str | None = None
    conflictCount: int = 0
    conflictLines: list[ConflictLineOut] = Field(default_factory=list)


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


def _normalize_connection_mode(mode: str | None) -> str:
    return "local" if (mode or "").strip().lower() == "local" else "ftp"


def _setting_to_cfg(session, st: FtpSetting) -> FtpConfig:
    profile_id = getattr(st, "ftp_profile_id", None)
    if profile_id:
        prof = session.get(FtpProfile, profile_id)
        if not prof:
            raise HTTPException(status_code=400, detail="ftp profile not found")
        return FtpConfig(
            host=prof.host,
            port=prof.port,
            username=prof.username,
            password=decrypt_text(prof.password_enc),
            passive_mode=prof.passive_mode,
            remote_root=prof.remote_root,
            ftp_encoding=getattr(prof, "ftp_encoding", "auto") or "auto",
        )
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


def _resolve_project_local_dir(proj: Project) -> Path:
    target_raw = (proj.remote_path or "").strip()
    if not target_raw:
        raise HTTPException(status_code=400, detail="local target path not configured")
    target = Path(target_raw).expanduser()
    if not target.is_absolute():
        raise HTTPException(status_code=400, detail="local target path must be an absolute path")
    return target.resolve()


def _parse_script_extensions(raw: str | None) -> list[str]:
    if not raw:
        return [".sql"]
    s = raw.strip()
    if not s:
        return [".sql"]
    try:
        if s.startswith("["):
            data = json.loads(s)
            if isinstance(data, list):
                out: list[str] = []
                for item in data:
                    if not isinstance(item, str):
                        continue
                    t = item.strip().lower()
                    if not t:
                        continue
                    if not t.startswith("."):
                        t = "." + t
                    out.append(t)
                return out or [".sql"]
    except Exception:
        pass

    parts = [p.strip().lower() for p in s.replace(";", ",").split(",")]
    out2: list[str] = []
    for p in parts:
        if not p:
            continue
        if not p.startswith("."):
            p = "." + p
        out2.append(p)
    return out2 or [".sql"]


def _project_script_extensions(proj: Project) -> list[str]:
    return _parse_script_extensions(getattr(proj, "script_extensions", None))


def _normalize_script_extensions_input(exts: list[str] | None) -> list[str]:
    raw = exts or []
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        t = item.strip().lower()
        if not t:
            continue
        if not t.startswith("."):
            t = "." + t
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out or [".sql"]


def _normalize_local_workspace_paths_input(
    local_workspace_path: str | None,
    local_workspace_paths: list[str] | None,
) -> list[str]:
    raw: list[str] = []
    if local_workspace_paths and isinstance(local_workspace_paths, list):
        raw = [x for x in local_workspace_paths if isinstance(x, str)]
    elif local_workspace_path and isinstance(local_workspace_path, str):
        raw = [local_workspace_path]

    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        p = (item or "").strip()
        if not p:
            continue
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    if not out:
        raise HTTPException(status_code=400, detail="local workspace path required")
    return out


def _project_local_workspace_paths(proj: Project) -> list[str]:
    raw = getattr(proj, "local_workspace_paths", None)
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                out = [str(x).strip() for x in data if isinstance(x, str) and str(x).strip()]
                if out:
                    return out
        except Exception:
            pass
    p = (getattr(proj, "local_workspace_path", "") or "").strip()
    return [p] if p else []


def _workspace_root_key(path: str) -> str:
    p = Path(path)
    base = p.name or "root"
    base2 = "".join([c if (c.isalnum() or c in "-_.") else "-" for c in base]).strip("-") or "root"
    norm = str(path).replace("\\", "/").lower()
    suf = sha256_hex(norm.encode("utf-8"))[:6]
    return f"{base2}__{suf}"


def _project_workspace_roots(proj: Project) -> list[tuple[str, Path]]:
    roots: list[tuple[str, Path]] = []
    for raw in _project_local_workspace_paths(proj):
        p = Path(raw).expanduser()
        if not p.is_absolute():
            raise HTTPException(status_code=400, detail="local workspace path must be an absolute path")
        pr = p.resolve()
        roots.append((_workspace_root_key(str(pr)), pr))
    if not roots:
        raise HTTPException(status_code=400, detail="local workspace path required")
    return roots


def _ensure_project_workspaces_exist(proj: Project) -> list[tuple[str, Path]]:
    roots = _project_workspace_roots(proj)
    missing = [str(p) for _, p in roots if not p.exists()]
    if missing:
        raise HTTPException(status_code=400, detail=f"local workspace path does not exist: {missing[0]}")
    return roots


def _resolve_project_workspace_file(proj: Project, rel: str) -> Path:
    roots = _project_workspace_roots(proj)
    if len(roots) == 1:
        return (roots[0][1] / rel).resolve()

    key_to_root = {k: p for k, p in roots}
    parts = (rel or "").split("/", 1)
    if len(parts) == 2 and parts[0] in key_to_root:
        return (key_to_root[parts[0]] / parts[1]).resolve()

    for _, root in roots:
        p = (root / rel).resolve()
        if p.exists():
            return p
    return (roots[0][1] / rel).resolve()


def _read_project_local_bytes(proj: Project, rel: str) -> bytes | None:
    roots = _project_workspace_roots(proj)
    if len(roots) == 1:
        return _read_local_bytes(roots[0][1], rel)
    parts = (rel or "").split("/", 1)
    if len(parts) == 2:
        key = parts[0]
        rest = parts[1]
        for k, root in roots:
            if k == key:
                return _read_local_bytes(root, rest)
    for _, root in roots:
        data = _read_local_bytes(root, rel)
        if data is not None:
            return data
    return None


def _write_project_local_bytes(proj: Project, rel: str, data: bytes) -> None:
    roots = _project_workspace_roots(proj)
    if len(roots) == 1:
        _write_local_bytes(roots[0][1], rel, data)
        return
    parts = (rel or "").split("/", 1)
    if len(parts) == 2:
        key = parts[0]
        rest = parts[1]
        for k, root in roots:
            if k == key:
                _write_local_bytes(root, rest, data)
                return
    _write_local_bytes(roots[0][1], rel, data)


def _list_project_workspace_files(proj: Project, exts: list[str]) -> list[tuple[str, Path]]:
    roots = _ensure_project_workspaces_exist(proj)
    if len(roots) == 1:
        base = roots[0][1]
        return [(row.relative_path, row.absolute_path) for row in list_workspace_files(base, exts)]
    out: list[tuple[str, Path]] = []
    for key, base in roots:
        for row in list_workspace_files(base, exts):
            out.append((f"{key}/{row.relative_path}", row.absolute_path))
    out.sort(key=lambda x: x[0])
    return out


def _list_files_in_dir(base_dir: Path, exts: list[str]) -> list[str]:
    if not base_dir.exists():
        return []
    return [row.relative_path for row in list_workspace_files(base_dir, exts)]


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


def _split_keepends_text(data: bytes | None) -> tuple[str, list[str]]:
    text = decode_sql_bytes(data or b"")
    return text, text.splitlines(keepends=True)


def _detect_text_encoding(*values: bytes | None) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk", "latin-1"):
        ok = True
        for data in values:
            if data is None:
                continue
            try:
                data.decode(enc)
            except UnicodeDecodeError:
                ok = False
                break
        if ok:
            return enc
    return "utf-8"


def _build_conflict_lines(local_text: str, remote_text: str, default_side: str) -> list[ConflictLineOut]:
    import difflib

    local_lines = local_text.splitlines()
    remote_lines = remote_text.splitlines()
    sm = difflib.SequenceMatcher(a=local_lines, b=remote_lines)
    out: list[ConflictLineOut] = []
    local_no = 1
    remote_no = 1
    idx = 0

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            local_no += i2 - i1
            remote_no += j2 - j1
            continue

        a_chunk = local_lines[i1:i2]
        b_chunk = remote_lines[j1:j2]
        size = max(len(a_chunk), len(b_chunk))
        for k in range(size):
            a_text = a_chunk[k] if k < len(a_chunk) else ""
            b_text = b_chunk[k] if k < len(b_chunk) else ""
            out.append(
                ConflictLineOut(
                    index=idx,
                    localNo=(local_no + k) if k < len(a_chunk) else None,
                    remoteNo=(remote_no + k) if k < len(b_chunk) else None,
                    localText=a_text,
                    remoteText=b_text,
                    selectedSide=default_side,
                )
            )
            idx += 1

        local_no += len(a_chunk)
        remote_no += len(b_chunk)

    return out


def _merge_text_by_choices(local_text: str, remote_text: str, choices: list[str], default_side: str) -> str:
    import difflib

    local_lines = local_text.splitlines(keepends=True)
    remote_lines = remote_text.splitlines(keepends=True)
    local_compare = local_text.splitlines()
    remote_compare = remote_text.splitlines()
    sm = difflib.SequenceMatcher(a=local_compare, b=remote_compare)

    out: list[str] = []
    idx = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            out.extend(local_lines[i1:i2])
            continue

        a_chunk = local_lines[i1:i2]
        b_chunk = remote_lines[j1:j2]
        size = max(len(a_chunk), len(b_chunk))
        for k in range(size):
            choice = choices[idx] if idx < len(choices) else default_side
            choice = choice if choice in ("local", "remote") else default_side
            if choice == "local":
                if k < len(a_chunk):
                    out.append(a_chunk[k])
            else:
                if k < len(b_chunk):
                    out.append(b_chunk[k])
            idx += 1

    return "".join(out)


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

        fp = _resolve_project_workspace_file(proj, s.relative_path)
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
            localWorkspacePaths=_project_local_workspace_paths(r),
            remotePath=r.remote_path,
            scriptExtensions=_project_script_extensions(r),
            createdAt=r.created_at,
        )
        for r in rows
    ]


@api_router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, current_user: CurrentUser):
    pid = str(uuid.uuid4())
    exts = _normalize_script_extensions_input(body.scriptExtensions)
    local_paths = _normalize_local_workspace_paths_input(body.localWorkspacePath, body.localWorkspacePaths)
    p = Project(
        id=pid,
        name=body.name,
        local_workspace_path=local_paths[0],
        local_workspace_paths=json.dumps(local_paths, ensure_ascii=False),
        remote_path=body.remotePath,
        script_extensions=json.dumps(exts, ensure_ascii=False),
    )
    with session_scope() as session:
        session.add(p)
        session.commit()
    _log(pid, "project.create", "ok", body.name, actor=current_user)
    return ProjectOut(
        id=p.id,
        name=p.name,
        localWorkspacePath=p.local_workspace_path,
        localWorkspacePaths=_project_local_workspace_paths(p),
        remotePath=p.remote_path,
        scriptExtensions=_project_script_extensions(p),
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
        if body.localWorkspacePath is not None or body.localWorkspacePaths is not None:
            local_paths = _normalize_local_workspace_paths_input(body.localWorkspacePath, body.localWorkspacePaths)
            p.local_workspace_path = local_paths[0]
            p.local_workspace_paths = json.dumps(local_paths, ensure_ascii=False)
        if body.remotePath is not None:
            p.remote_path = body.remotePath
        if body.scriptExtensions is not None:
            p.script_extensions = json.dumps(_normalize_script_extensions_input(body.scriptExtensions), ensure_ascii=False)
        session.add(p)
        session.commit()
    _log(project_id, "project.update", "ok", "", actor=current_user)
    return ProjectOut(
        id=p.id,
        name=p.name,
        localWorkspacePath=p.local_workspace_path,
        localWorkspacePaths=_project_local_workspace_paths(p),
        remotePath=p.remote_path,
        scriptExtensions=_project_script_extensions(p),
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
    if _normalize_connection_mode(body.connectionMode) != "ftp":
        return {"ok": True, "pwd": "local://", "features": []}
    with session_scope() as session:
        if body.ftpProfileId:
            prof = session.get(FtpProfile, body.ftpProfileId)
            if not prof:
                raise HTTPException(status_code=404, detail="ftp profile not found")
            cfg = FtpConfig(
                host=prof.host,
                port=prof.port,
                username=prof.username,
                password=decrypt_text(prof.password_enc),
                passive_mode=prof.passive_mode,
                remote_root=prof.remote_root,
                ftp_encoding=getattr(prof, "ftp_encoding", "auto") or "auto",
            )
        else:
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
    with session_scope() as session:
        if body.ftpProfileId:
            prof = session.get(FtpProfile, body.ftpProfileId)
            if not prof:
                raise HTTPException(status_code=404, detail="ftp profile not found")
            cfg = FtpConfig(
                host=prof.host,
                port=prof.port,
                username=prof.username,
                password=decrypt_text(prof.password_enc),
                passive_mode=prof.passive_mode,
                remote_root=prof.remote_root,
                ftp_encoding=getattr(prof, "ftp_encoding", "auto") or "auto",
            )
        else:
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
    connection_mode = _normalize_connection_mode(body.connectionMode)
    with session_scope() as session:
        existing = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if existing:
            existing.connection_mode = connection_mode
            existing.ftp_profile_id = body.ftpProfileId if connection_mode == "ftp" else None
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
                    ftp_profile_id=body.ftpProfileId if connection_mode == "ftp" else None,
                    connection_mode=connection_mode,
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
    _log(project_id, f"{connection_mode}.save", "ok", f"{body.host}:{body.port}", actor=current_user)
    return FtpSettingOut(
        connectionMode=connection_mode,
        ftpProfileId=body.ftpProfileId if connection_mode == "ftp" else None,
        host=body.host,
        port=body.port,
        username=body.username,
        passiveMode=body.passiveMode,
        remoteRoot=body.remoteRoot,
        ftpEncoding=body.ftpEncoding,
    )


@api_router.get("/projects/{project_id}/ftp", response_model=FtpSettingFullOut)
def get_ftp_setting(project_id: str, current_user: CurrentUser):
    with session_scope() as session:
        st = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if not st:
            raise HTTPException(status_code=400, detail="ftp setting not configured")
        mode = _normalize_connection_mode(getattr(st, "connection_mode", "ftp"))
        profile_id = getattr(st, "ftp_profile_id", None) if mode == "ftp" else None
        if profile_id:
            prof = session.get(FtpProfile, profile_id)
            if not prof:
                raise HTTPException(status_code=404, detail="ftp profile not found")
            return FtpSettingFullOut(
                connectionMode=mode,
                ftpProfileId=profile_id,
                host=prof.host,
                port=prof.port,
                username=prof.username,
                password=decrypt_text(prof.password_enc),
                passiveMode=prof.passive_mode,
                remoteRoot=prof.remote_root,
                ftpEncoding=getattr(prof, "ftp_encoding", "auto") or "auto",
            )
        return FtpSettingFullOut(
            connectionMode=mode,
            ftpProfileId=None,
            host=st.host,
            port=st.port,
            username=st.username,
            password=decrypt_text(st.password_enc),
            passiveMode=st.passive_mode,
            remoteRoot=st.remote_root,
            ftpEncoding=getattr(st, "ftp_encoding", "auto") or "auto",
        )


@api_router.get("/ftp-profiles", response_model=list[FtpProfileOut])
def list_ftp_profiles(current_user: CurrentUser):
    with session_scope() as session:
        rows = session.exec(select(FtpProfile).order_by(FtpProfile.created_at.desc())).all()
    return [
        FtpProfileOut(
            id=r.id,
            name=r.name,
            host=r.host,
            port=r.port,
            username=r.username,
            passiveMode=r.passive_mode,
            remoteRoot=r.remote_root,
            ftpEncoding=getattr(r, "ftp_encoding", "auto") or "auto",
            createdAt=r.created_at,
        )
        for r in rows
    ]


@api_router.get("/ftp-profiles/{profile_id}", response_model=FtpProfileFullOut)
def get_ftp_profile(profile_id: str, current_user: CurrentUser):
    with session_scope() as session:
        prof = session.get(FtpProfile, profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="ftp profile not found")
    return FtpProfileFullOut(
        id=prof.id,
        name=prof.name,
        host=prof.host,
        port=prof.port,
        username=prof.username,
        password=decrypt_text(prof.password_enc),
        passiveMode=prof.passive_mode,
        remoteRoot=prof.remote_root,
        ftpEncoding=getattr(prof, "ftp_encoding", "auto") or "auto",
        createdAt=prof.created_at,
    )


@api_router.post("/ftp-profiles", response_model=FtpProfileOut)
def create_ftp_profile(body: FtpProfileIn, current_user: CurrentUser):
    pid = str(uuid.uuid4())
    prof = FtpProfile(
        id=pid,
        name=body.name,
        host=body.host,
        port=body.port,
        username=body.username,
        password_enc=encrypt_text(body.password),
        passive_mode=body.passiveMode,
        remote_root=body.remoteRoot,
        ftp_encoding=body.ftpEncoding,
    )
    with session_scope() as session:
        session.add(prof)
        session.commit()
    _log(None, "ftp_profile.create", "ok", body.name, actor=current_user)
    return FtpProfileOut(
        id=prof.id,
        name=prof.name,
        host=prof.host,
        port=prof.port,
        username=prof.username,
        passiveMode=prof.passive_mode,
        remoteRoot=prof.remote_root,
        ftpEncoding=getattr(prof, "ftp_encoding", "auto") or "auto",
        createdAt=prof.created_at,
    )


@api_router.put("/ftp-profiles/{profile_id}", response_model=FtpProfileOut)
def update_ftp_profile(profile_id: str, body: FtpProfileIn, current_user: CurrentUser):
    with session_scope() as session:
        prof = session.get(FtpProfile, profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="ftp profile not found")
        prof.name = body.name
        prof.host = body.host
        prof.port = body.port
        prof.username = body.username
        prof.password_enc = encrypt_text(body.password)
        prof.passive_mode = body.passiveMode
        prof.remote_root = body.remoteRoot
        prof.ftp_encoding = body.ftpEncoding
        session.add(prof)
        session.commit()
    _log(None, "ftp_profile.update", "ok", f"profileId={profile_id}", actor=current_user)
    return FtpProfileOut(
        id=prof.id,
        name=prof.name,
        host=prof.host,
        port=prof.port,
        username=prof.username,
        passiveMode=prof.passive_mode,
        remoteRoot=prof.remote_root,
        ftpEncoding=getattr(prof, "ftp_encoding", "auto") or "auto",
        createdAt=prof.created_at,
    )


@api_router.delete("/ftp-profiles/{profile_id}")
def delete_ftp_profile(profile_id: str, current_user: CurrentUser):
    with session_scope() as session:
        prof = session.get(FtpProfile, profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="ftp profile not found")
        refs = session.exec(select(FtpSetting).where(FtpSetting.ftp_profile_id == profile_id)).all()
        for st in refs:
            st.ftp_profile_id = None
            session.add(st)
        session.delete(prof)
        session.commit()
    _log(None, "ftp_profile.delete", "ok", f"profileId={profile_id}", actor=current_user)
    return {"ok": True}


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
    exts = _project_script_extensions(proj)
    files = _list_project_workspace_files(proj, exts)
    out: list[ScriptOut] = []
    for rel, abs_path in files:
        s = upsert_script(project_id, rel)
        data = abs_path.read_bytes()
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

    fp = _resolve_project_workspace_file(proj, s.relative_path)
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


@api_router.post("/versions/{version_id}/rollback-local", response_model=RollbackOut)
@api_router.post("/versions/{version_id}/rollback-to-ftp", response_model=RollbackOut)
def rollback_version_to_local(version_id: str, body: RollbackIn, current_user: CurrentUser):
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

    data = read_snapshot(target)
    _ensure_project_workspaces_exist(proj)
    workspace_path = str(_resolve_project_workspace_file(proj, script.relative_path))
    try:
        _write_project_local_bytes(proj, script.relative_path, data)
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
            f"{script.relative_path} rollbackTo={target.version_no} workspacePath={workspace_path} "
            f"createdVersion={created_version.version_no if created_version else '-'}"
        )
        _log(proj.id, "version.rollback.local", "ok", detail, actor=current_user)
        return RollbackOut(
            ok=True,
            targetVersionId=target.id,
            targetVersionNo=target.version_no,
            workspacePath=workspace_path,
            createdVersionId=created_version.id if created_version else None,
            createdVersionNo=created_version.version_no if created_version else None,
            message=f"已回退到 {target.version_no}，仅更新本地工作区",
        )
    except Exception as e:
        _log(proj.id, "version.rollback.local", "error", f"versionId={version_id} error={e}", actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))


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
    with session_scope() as session:
        st = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if not st:
            raise HTTPException(status_code=400, detail="ftp setting not configured")
        mode = _normalize_connection_mode(getattr(st, "connection_mode", "ftp"))
        cfg = _setting_to_cfg(session, st) if mode == "ftp" else None
    exts = _project_script_extensions(proj)
    _ensure_project_workspaces_exist(proj)

    try:
        if mode == "local":
            remote_dir_path = _resolve_project_local_dir(proj)
            if not remote_dir_path.exists():
                raise HTTPException(status_code=400, detail="local target path does not exist")
            remote_dir = str(remote_dir_path)
            rels = _list_files_in_dir(remote_dir_path, exts)
        else:
            if not cfg:
                raise HTTPException(status_code=400, detail="ftp setting not configured")
            remote_dir = _resolve_project_remote_dir(cfg, proj.remote_path)
            log_info(
                "ftp.pull.start "
                f"projectId={project_id} remoteRoot={cfg.remote_root} projectRemote={proj.remote_path} "
                f"resolvedRemoteDir={remote_dir} dryRun={body.dryRun} overwrite={body.overwrite}"
            )
            ftp = connect(cfg)
            try:
                rels = list_sql_files(ftp, remote_dir, exts)
            except Exception:
                try:
                    ftp.quit()
                except Exception:
                    ftp.close()
                raise

        results: list[FileStatus] = []

        for rel in rels:
            if body.paths and rel not in body.paths:
                continue

            if mode == "local":
                remote_path = str((remote_dir_path / rel).resolve())
                remote_bytes = _read_local_bytes(remote_dir_path, rel)
                if remote_bytes is None:
                    continue
            else:
                remote_path = remote_join(remote_dir, rel)
                remote_bytes = download_bytes(ftp, remote_path)
            local_bytes = _read_project_local_bytes(proj, rel)
            local_exists = local_bytes is not None
            remote_exists = True

            local_text = decode_sql_bytes(local_bytes or b"")
            remote_text = decode_sql_bytes(remote_bytes)
            status_name = "new" if not local_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            conflict_lines: list[ConflictLineOut] = []
            if status_name in ("modified", "new"):
                diff_preview = _unified_preview(local_text, remote_text)
            if status_name == "modified":
                conflict_lines = _build_conflict_lines(local_text, remote_text, "remote")

            if not body.dryRun:
                if status_name == "new":
                    _write_project_local_bytes(proj, rel, remote_bytes)
                elif status_name == "modified":
                    selections = (body.conflictSelections or {}).get(rel)
                    if conflict_lines and selections:
                        merged_text = _merge_text_by_choices(local_text, remote_text, selections, "remote")
                        merged_bytes = merged_text.encode(_detect_text_encoding(local_bytes, remote_bytes))
                        _write_project_local_bytes(proj, rel, merged_bytes)
                    elif body.overwrite:
                        _write_project_local_bytes(proj, rel, remote_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status_name,
                    localExists=local_exists,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                    conflictCount=len(conflict_lines),
                    conflictLines=conflict_lines,
                )
            )

        _log(project_id, f"{mode}.pull", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} {_summarize_files(results)}", actor=current_user)
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, f"{mode}.pull", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if mode == "ftp" and "ftp" in locals():
            try:
                ftp.quit()
            except Exception:
                ftp.close()


@api_router.post("/projects/{project_id}/push", response_model=PullPushOut)
def push_to_ftp(project_id: str, body: PullPushIn, current_user: CurrentUser):
    proj = _get_project(project_id)
    with session_scope() as session:
        st = session.exec(select(FtpSetting).where(FtpSetting.project_id == project_id)).first()
        if not st:
            raise HTTPException(status_code=400, detail="ftp setting not configured")
        mode = _normalize_connection_mode(getattr(st, "connection_mode", "ftp"))
        cfg = _setting_to_cfg(session, st) if mode == "ftp" else None
    exts = _project_script_extensions(proj)
    local_files = [rel for rel, _ in _list_project_workspace_files(proj, exts)]

    try:
        if mode == "local":
            remote_dir_path = _resolve_project_local_dir(proj)
            remote_rels = set(_list_files_in_dir(remote_dir_path, exts))
        else:
            if not cfg:
                raise HTTPException(status_code=400, detail="ftp setting not configured")
            remote_dir = _resolve_project_remote_dir(cfg, proj.remote_path)
            log_info(
                "ftp.push.start "
                f"projectId={project_id} remoteRoot={cfg.remote_root} projectRemote={proj.remote_path} "
                f"resolvedRemoteDir={remote_dir} dryRun={body.dryRun} overwrite={body.overwrite}"
            )
            ftp = connect(cfg)
            remote_rels = set(list_sql_files(ftp, remote_dir, exts))
        results: list[FileStatus] = []

        for rel in local_files:
            if body.paths and rel not in body.paths:
                continue

            local_bytes = _read_project_local_bytes(proj, rel)
            if local_bytes is None:
                continue

            if mode == "local":
                remote_path = str((remote_dir_path / rel).resolve())
            else:
                remote_path = remote_join(remote_dir, rel)
            remote_exists = rel in remote_rels
            remote_bytes = b""
            if remote_exists:
                try:
                    remote_bytes = _read_local_bytes(remote_dir_path, rel) if mode == "local" else download_bytes(ftp, remote_path)
                    if remote_bytes is None:
                        remote_exists = False
                        remote_bytes = b""
                except Exception:
                    remote_exists = False
                    remote_bytes = b""

            local_text = decode_sql_bytes(local_bytes)
            remote_text = decode_sql_bytes(remote_bytes)
            status_name = "new" if not remote_exists else ("unchanged" if local_bytes == remote_bytes else "modified")
            diff_preview = None
            conflict_lines: list[ConflictLineOut] = []
            if status_name in ("modified", "new"):
                diff_preview = _unified_preview(remote_text, local_text)
            if status_name == "modified":
                conflict_lines = _build_conflict_lines(local_text, remote_text, "local")

            if not body.dryRun:
                if status_name == "new":
                    if mode == "local":
                        remote_dir_path.mkdir(parents=True, exist_ok=True)
                        _write_local_bytes(remote_dir_path, rel, local_bytes)
                    else:
                        upload_bytes(ftp, remote_path, local_bytes)
                elif status_name == "modified":
                    selections = (body.conflictSelections or {}).get(rel)
                    if conflict_lines and selections:
                        merged_text = _merge_text_by_choices(local_text, remote_text, selections, "local")
                        merged_bytes = merged_text.encode(_detect_text_encoding(local_bytes, remote_bytes))
                        if mode == "local":
                            remote_dir_path.mkdir(parents=True, exist_ok=True)
                            _write_local_bytes(remote_dir_path, rel, merged_bytes)
                        else:
                            upload_bytes(ftp, remote_path, merged_bytes)
                    elif body.overwrite:
                        if mode == "local":
                            remote_dir_path.mkdir(parents=True, exist_ok=True)
                            _write_local_bytes(remote_dir_path, rel, local_bytes)
                        else:
                            upload_bytes(ftp, remote_path, local_bytes)

            results.append(
                FileStatus(
                    relativePath=rel,
                    status=status_name,
                    localExists=True,
                    remoteExists=remote_exists,
                    diffPreview=diff_preview,
                    conflictCount=len(conflict_lines),
                    conflictLines=conflict_lines,
                )
            )

        _log(project_id, f"{mode}.push", "ok", f"dryRun={body.dryRun} overwrite={body.overwrite} {_summarize_files(results)}", actor=current_user)
        return PullPushOut(files=results)
    except Exception as e:
        _log(project_id, f"{mode}.push", "error", str(e), actor=current_user)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if mode == "ftp" and "ftp" in locals():
            try:
                ftp.quit()
            except Exception:
                ftp.close()
