from __future__ import annotations

import os
import traceback

import uvicorn

from sqlftpvc.config import resolve_data_dir
from sqlftpvc.app import create_app


def main() -> None:
    host = os.environ.get("SQLFTPVC_HOST", "127.0.0.1")
    port = int(os.environ.get("SQLFTPVC_PORT", "8848"))
    try:
        app = create_app()
        uvicorn.run(app, host=host, port=port)
    except Exception:
        try:
            data_dir = resolve_data_dir()
            data_dir.mkdir(parents=True, exist_ok=True)
            crash_log = data_dir / "crash.log"
            crash_log.write_text(traceback.format_exc(), encoding="utf-8")
            print(f"Fatal error. Crash log written to: {crash_log}")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()

