"""
Phase I2a: Bearer token auth for non-browser clients (WeChat mini-program prep).

Uses signed timed tokens (itsdangerous) — no database table. Web UI keeps Flask session cookies.
"""
from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from eap_config import config

TOKEN_SALT = "eap-api-v1-token"


def _token_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(config.SECRET_KEY, salt=TOKEN_SALT)


def issue_access_token(user_id: int) -> tuple[str, int]:
    """Return (access_token, expires_in_seconds)."""
    uid = int(user_id)
    token = _token_serializer().dumps({"uid": uid})
    return token, int(config.TOKEN_TTL_SECONDS)


def verify_access_token(token: str) -> int | None:
    """Return user id if valid and not expired, else None."""
    if not token or not str(token).strip():
        return None
    try:
        data = _token_serializer().loads(str(token).strip(), max_age=int(config.TOKEN_TTL_SECONDS))
        return int(data["uid"])
    except (BadSignature, SignatureExpired, KeyError, TypeError, ValueError):
        return None


def get_bearer_token_from_header(authorization_header: str | None) -> str | None:
    """Parse Authorization: Bearer <token>. Returns token string or None."""
    if not authorization_header:
        return None
    parts = str(authorization_header).strip().split(None, 1)
    if len(parts) != 2:
        return None
    if parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token if token else None
