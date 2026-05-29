from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("SQLFTPVC_HOST", "127.0.0.1")
    port = int(os.environ.get("SQLFTPVC_PORT", "8848"))
    uvicorn.run("sqlftpvc.app:create_app", host=host, port=port, factory=True)


if __name__ == "__main__":
    main()

