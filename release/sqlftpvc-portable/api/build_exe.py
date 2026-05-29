from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _add_data_arg(src: Path, dest: str) -> str:
    sep = ";" if os.name == "nt" else ":"
    return f"{src}{sep}{dest}"


def main() -> int:
    root = _repo_root()
    dist_dir = root / "dist"
    if not (dist_dir / "index.html").exists():
        print("Missing frontend build: dist/index.html")
        print("Run `npm run build` at repo root first.")
        return 2

    out_dir = root / "release" / "bin"
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
        "sqlftpvc",
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
    print(f"Built: {out_dir / ('sqlftpvc.exe' if os.name == 'nt' else 'sqlftpvc')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

