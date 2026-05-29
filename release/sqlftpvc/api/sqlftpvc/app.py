from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ensure_dirs, get_paths
from .db import init_db
from .routes import api_router


def _resolve_web_dist() -> Path | None:
    candidates: list[Path] = []

    cwd = Path.cwd()
    candidates.append(cwd / "dist")

    exe_dir = Path(sys.executable).resolve().parent
    candidates.append(exe_dir / "dist")

    if getattr(sys, "_MEIPASS", None):
        candidates.append(Path(sys._MEIPASS) / "dist")

    repo_root = Path(__file__).resolve().parents[2]
    candidates.extend(
        [
            repo_root / "dist",
            repo_root / "api" / "web_dist",
        ]
    )
    for c in candidates:
        if (c / "index.html").exists():
            return c
    return None


def create_app() -> FastAPI:
    paths = get_paths()
    ensure_dirs(paths)
    init_db()

    app = FastAPI(title="sqlftpvc")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    web_dist = _resolve_web_dist()
    if web_dist:
        assets = web_dist / "assets"
        if assets.exists() and assets.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

        @app.get("/")
        def spa_root():
            return FileResponse(str(web_dist / "index.html"))

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            if full_path.startswith("api/") or full_path == "api":
                raise HTTPException(status_code=404, detail="not found")
            return FileResponse(str(web_dist / "index.html"))

    return app

