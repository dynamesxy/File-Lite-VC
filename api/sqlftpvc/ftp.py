from __future__ import annotations

import io
import os
import posixpath
from urllib.parse import unquote
from dataclasses import dataclass
from ftplib import FTP, error_perm
from typing import Callable, Iterable, Iterator, TypeVar

from .runtime_log import log_error, log_info

T = TypeVar("T")


@dataclass(frozen=True)
class FtpConfig:
    host: str
    port: int
    username: str
    password: str
    passive_mode: bool
    remote_root: str
    ftp_encoding: str = "auto"


@dataclass(frozen=True)
class DirEntry:
    name: str
    path: str


def _with_encoding_fallback(ftp: FTP, label: str, fn: Callable[[], T]) -> T:
    try:
        return fn()
    except (UnicodeDecodeError, error_perm) as e:
        is_decode_error = isinstance(e, UnicodeDecodeError)
        is_550 = isinstance(e, error_perm) and "550" in str(e)
        if not (is_decode_error or is_550):
            raise

        kind = "decode_error" if is_decode_error else "550"
        log_error(f"{label}.{kind} encoding={getattr(ftp, 'encoding', None)} error={e}")

        for enc in ("gbk", "utf-8", "latin-1"):
            if getattr(ftp, "encoding", None) == enc:
                continue
            try:
                ftp.encoding = enc
                log_info(f"{label}.retry encoding={enc}")
                return fn()
            except UnicodeDecodeError as e2:
                log_error(f"{label}.retry.decode_error encoding={enc} error={e2}")
                continue
            except error_perm as e3:
                if "550" in str(e3):
                    log_error(f"{label}.retry.550 encoding={enc} error={e3}")
                    continue
                raise

        raise


def _normalize_remote_dir(p: str) -> str:
    if not p:
        return "/"
    p2 = unquote(p).replace("\\", "/")
    if not p2.startswith("/"):
        p2 = "/" + p2
    return posixpath.normpath(p2)


def remote_join(*parts: str) -> str:
    joined = "/"
    for part in parts:
        if not part:
            continue
        part2 = unquote(part).replace("\\", "/")
        if part2.startswith("/"):
            part2 = part2.lstrip("/")
        joined = posixpath.join(joined, part2)
    return posixpath.normpath(joined)


def decode_sql_bytes(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="replace")


def connect(cfg: FtpConfig) -> FTP:
    ftp = FTP()
    env_enc = os.environ.get("SQLFTPVC_FTP_ENCODING")
    cfg_enc = (cfg.ftp_encoding or "auto").strip().lower()
    if env_enc:
        enc = env_enc.strip()
        enc_source = "env"
    elif cfg_enc and cfg_enc != "auto":
        enc = cfg_enc
        enc_source = "project"
    else:
        enc = "utf-8"
        enc_source = "auto"

    ftp.encoding = enc
    log_info(
        "ftp.connect.start "
        f"host={cfg.host} port={cfg.port} passive={cfg.passive_mode} "
        f"encoding={ftp.encoding} encodingSource={enc_source} remoteRoot={_normalize_remote_dir(cfg.remote_root)}"
    )
    ftp.connect(cfg.host, cfg.port, timeout=20)
    ftp.login(cfg.username, cfg.password)
    ftp.set_pasv(cfg.passive_mode)
    if ftp.encoding.lower().replace("-", "") == "utf8":
        try:
            ftp.sendcmd("OPTS UTF8 ON")
        except Exception:
            pass
    root = _normalize_remote_dir(cfg.remote_root)
    ftp.cwd(root)
    log_info(f"ftp.connect.ok pwd={ftp.pwd()}")
    return ftp


def test_connection(cfg: FtpConfig) -> dict:
    ftp = connect(cfg)
    try:
        pwd = ftp.pwd()
        feats = []
        try:
            feats = ftp.sendcmd("FEAT").splitlines()
        except Exception:
            feats = []
        return {"ok": True, "pwd": pwd, "features": feats}
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


def ensure_remote_dirs(ftp: FTP, remote_dir: str) -> None:
    target = _normalize_remote_dir(remote_dir)
    parts = [p for p in target.split("/") if p]
    log_info(f"ftp.ensure_dirs.start target={target}")
    ftp.cwd("/")
    for p in parts:
        try:
            ftp.cwd(p)
        except error_perm:
            log_info(f"ftp.ensure_dirs.mkdir part={p}")
            ftp.mkd(p)
            ftp.cwd(p)
    log_info(f"ftp.ensure_dirs.ok target={target}")


def list_sql_files(ftp: FTP, remote_dir: str) -> list[str]:
    base = _normalize_remote_dir(remote_dir)
    log_info(f"ftp.list_sql.start base={base}")
    try:
        out = _with_encoding_fallback(ftp, "ftp.list_sql.mlsd", lambda: _list_sql_files_mlsd(ftp, base))
        log_info(f"ftp.list_sql.ok mode=mlsd base={base} count={len(out)}")
        return out
    except Exception as e:
        log_error(f"ftp.list_sql.mlsd.error base={base} error={e}")
        out = _with_encoding_fallback(ftp, "ftp.list_sql.nlst", lambda: _list_sql_files_nlst(ftp, base))
        log_info(f"ftp.list_sql.ok mode=nlst base={base} count={len(out)}")
        return out


def list_dirs(ftp: FTP, remote_dir: str) -> list[DirEntry]:
    base = _normalize_remote_dir(remote_dir)
    log_info(f"ftp.list_dirs.start base={base}")
    try:
        out = _with_encoding_fallback(ftp, "ftp.list_dirs.mlsd", lambda: _list_dirs_mlsd(ftp, base))
        log_info(f"ftp.list_dirs.ok mode=mlsd base={base} count={len(out)}")
        return out
    except Exception as e:
        log_error(f"ftp.list_dirs.mlsd.error base={base} error={e}")
        out = _with_encoding_fallback(ftp, "ftp.list_dirs.nlst", lambda: _list_dirs_nlst(ftp, base))
        log_info(f"ftp.list_dirs.ok mode=nlst base={base} count={len(out)}")
        return out


def _list_sql_files_mlsd(ftp: FTP, base: str) -> list[str]:
    out: list[str] = []

    def walk(cur: str, prefix: str) -> None:
        ftp.cwd(cur)
        for name, facts in ftp.mlsd():
            if name in (".", ".."):
                continue
            typ = (facts or {}).get("type", "")
            rel = posixpath.join(prefix, name) if prefix else name
            if typ == "dir":
                walk(remote_join(cur, name), rel)
            else:
                if name.lower().endswith(".sql"):
                    out.append(rel)

    walk(base, "")
    out.sort()
    return out


def _list_sql_files_nlst(ftp: FTP, base: str) -> list[str]:
    out: list[str] = []

    def walk(cur: str, prefix: str) -> None:
        ftp.cwd(cur)
        names = ftp.nlst()
        for name in names:
            if name in (".", ".."):
                continue
            if "/" in name:
                name2 = name.rsplit("/", 1)[-1]
            else:
                name2 = name

            rel = posixpath.join(prefix, name2) if prefix else name2
            try:
                ftp.cwd(name2)
                ftp.cwd("..")
                walk(remote_join(cur, name2), rel)
                ftp.cwd(cur)
                continue
            except Exception:
                pass

            if name2.lower().endswith(".sql"):
                out.append(rel)

    walk(base, "")
    out.sort()
    return out


def _list_dirs_mlsd(ftp: FTP, base: str) -> list[DirEntry]:
    ftp.cwd(base)
    out: list[DirEntry] = []
    for name, facts in ftp.mlsd():
        if name in (".", ".."):
            continue
        typ = (facts or {}).get("type", "")
        if typ == "dir":
            out.append(DirEntry(name=name, path=remote_join(base, name)))
    out.sort(key=lambda x: x.name)
    return out


def _list_dirs_nlst(ftp: FTP, base: str) -> list[DirEntry]:
    out: list[DirEntry] = []
    ftp.cwd(base)
    names = ftp.nlst()
    for name in names:
        if name in (".", ".."):
            continue
        if "/" in name:
            name2 = name.rsplit("/", 1)[-1]
        else:
            name2 = name
        try:
            cur = ftp.pwd()
            ftp.cwd(name2)
            ftp.cwd(cur)
            out.append(DirEntry(name=name2, path=remote_join(base, name2)))
        except Exception:
            try:
                ftp.cwd(base)
            except Exception:
                pass
            continue
    out.sort(key=lambda x: x.name)
    return out


def download_bytes(ftp: FTP, remote_path: str) -> bytes:
    log_info(f"ftp.download.start remotePath={remote_path}")
    buf = io.BytesIO()
    ftp.retrbinary(f"RETR {remote_path}", buf.write)
    log_info(f"ftp.download.ok remotePath={remote_path} size={buf.tell()}")
    return buf.getvalue()


def upload_bytes(ftp: FTP, remote_path: str, data: bytes) -> None:
    remote_dir = posixpath.dirname(_normalize_remote_dir(remote_path))
    log_info(f"ftp.upload.start remotePath={remote_path} size={len(data)}")
    ensure_remote_dirs(ftp, remote_dir)
    ftp.cwd(remote_dir)
    name = posixpath.basename(remote_path)
    ftp.storbinary(f"STOR {name}", io.BytesIO(data))
    log_info(f"ftp.upload.ok remotePath={remote_path} size={len(data)}")

