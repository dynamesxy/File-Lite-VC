from __future__ import annotations

import io
import posixpath
from dataclasses import dataclass
from ftplib import FTP, error_perm
from typing import Iterable, Iterator


@dataclass(frozen=True)
class FtpConfig:
    host: str
    port: int
    username: str
    password: str
    passive_mode: bool
    remote_root: str


def _normalize_remote_dir(p: str) -> str:
    if not p:
        return "/"
    p2 = p.replace("\\", "/")
    if not p2.startswith("/"):
        p2 = "/" + p2
    return posixpath.normpath(p2)


def remote_join(*parts: str) -> str:
    joined = "/"
    for part in parts:
        if not part:
            continue
        part2 = part.replace("\\", "/")
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
    ftp.connect(cfg.host, cfg.port, timeout=20)
    ftp.login(cfg.username, cfg.password)
    ftp.set_pasv(cfg.passive_mode)
    root = _normalize_remote_dir(cfg.remote_root)
    ftp.cwd(root)
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
    ftp.cwd("/")
    for p in parts:
        try:
            ftp.cwd(p)
        except error_perm:
            ftp.mkd(p)
            ftp.cwd(p)


def list_sql_files(ftp: FTP, remote_dir: str) -> list[str]:
    base = _normalize_remote_dir(remote_dir)
    try:
        return _list_sql_files_mlsd(ftp, base)
    except Exception:
        return _list_sql_files_nlst(ftp, base)


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


def download_bytes(ftp: FTP, remote_path: str) -> bytes:
    buf = io.BytesIO()
    ftp.retrbinary(f"RETR {remote_path}", buf.write)
    return buf.getvalue()


def upload_bytes(ftp: FTP, remote_path: str, data: bytes) -> None:
    remote_dir = posixpath.dirname(_normalize_remote_dir(remote_path))
    ensure_remote_dirs(ftp, remote_dir)
    ftp.cwd(remote_dir)
    name = posixpath.basename(remote_path)
    ftp.storbinary(f"STOR {name}", io.BytesIO(data))

