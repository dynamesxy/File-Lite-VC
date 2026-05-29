from __future__ import annotations

import os
import socket
import traceback

import uvicorn

from sqlftpvc.config import resolve_data_dir
from sqlftpvc.app import create_app
from sqlftpvc.runtime_log import log_error, log_info, runtime_log_path


def _detect_lan_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
            if ip and not ip.startswith("127."):
                return ip
        except Exception:
            return None
    return None


def main() -> None:
    host = os.environ.get("SQLFTPVC_HOST", "0.0.0.0")
    port = int(os.environ.get("SQLFTPVC_PORT", "8848"))
    try:
        log_info(f"service.start host={host} port={port} runtimeLog={runtime_log_path()}")
        print(f"SQLFTPVC running on: http://127.0.0.1:{port}/")
        if host == "0.0.0.0":
            lan_ip = _detect_lan_ip()
            if lan_ip:
                print(f"LAN access: http://{lan_ip}:{port}/")
                log_info(f"service.lan_url url=http://{lan_ip}:{port}/")
        app = create_app()
        uvicorn.run(app, host=host, port=port)
    except Exception:
        log_error(f"service.crash {traceback.format_exc()}")
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

