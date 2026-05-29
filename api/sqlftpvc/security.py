from __future__ import annotations

import base64
import os
import secrets
from hashlib import pbkdf2_hmac
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


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"{base64.urlsafe_b64encode(salt).decode('ascii')}${base64.urlsafe_b64encode(digest).decode('ascii')}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_b64, digest_b64 = password_hash.split("$", 1)
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    except Exception:
        return False
    actual = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return secrets.compare_digest(actual, expected)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()

