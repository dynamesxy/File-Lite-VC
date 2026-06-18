from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _add_data_arg(src: Path, dest: str) -> str:
    sep = ";" if os.name == "nt" else ":"
    return f"{src}{sep}{dest}"


def _build_stamp() -> str:
    return datetime.now().strftime("%Y%m%d%H%M")


def main() -> int:
    root = _repo_root()
    dist_dir = root / "dist"
    if not (dist_dir / "index.html").exists():
        print("Missing frontend build: dist/index.html")
        print("Run `npm run build` at repo root first.")
        return 2

    release_dir = root / "release"
    release_dir.mkdir(parents=True, exist_ok=True)
    stable_bin_dir = release_dir / "bin"
    stable_bin_dir.mkdir(parents=True, exist_ok=True)

    build_id = _build_stamp()
    out_dir = release_dir / "bin_build" / build_id
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    build_dir = root / "release" / "pyinstaller_build"
    spec_dir = build_dir
    shutil.rmtree(build_dir, ignore_errors=True)
    build_dir.mkdir(parents=True, exist_ok=True)

    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "File-Lite-VC",
        "--distpath",
        str(out_dir),
        "--workpath",
        str(build_dir / "work"),
        "--specpath",
        str(spec_dir),
        "--paths",
        str(root / "api"),
        "--add-data",
        _add_data_arg(dist_dir, "dist"),
        "--collect-submodules",
        "sqlftpvc",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan.on",
        str(root / "api" / "sqlftpvc" / "__main__.py"),
    ]

    print("Building executable with PyInstaller...")
    subprocess.check_call(args, cwd=str(root))

    exe_name = "File-Lite-VC.exe" if os.name == "nt" else "File-Lite-VC"
    built_exe = out_dir / exe_name

    last_path_file = stable_bin_dir / "last_exe_path.txt"
    last_path_file.write_text(str(built_exe), encoding="utf-8")

    try:
        shutil.copy2(built_exe, stable_bin_dir / exe_name)
    except PermissionError:
        print(f"Warning: {stable_bin_dir / exe_name} is locked; keeping built exe at {built_exe}")

    print(f"Built: {built_exe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

