from __future__ import annotations

import base64
import os
from hashlib import sha256

from cryptography.fernet import Fernet


def _derive_key() -> bytes:
    seed = os.environ.get("SQLFTPVC_SECRET")
    if not seed:
        seed = "sqlftpvc-default-local-secret"
    digest = sha256(seed.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_text(plain: str) -> str:
    f = Fernet(_derive_key())
    token = f.encrypt(plain.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_text(token: str) -> str:
    f = Fernet(_derive_key())
    plain = f.decrypt(token.encode("utf-8"))
    return plain.decode("utf-8")

