"""
Phase F: centralized environment configuration for local dev and production deployment.

Load order: process environment only (no python-dotenv dependency). Host platforms
(Render, Railway, Docker, systemd) inject variables; copy .env.example for local files.
"""
from __future__ import annotations

import logging
import os
import sys

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _env_bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes")


def _parse_cors_origins(raw: str | None, public_url: str | None) -> list[str]:
    if raw is None or not str(raw).strip():
        origins = [
            "http://127.0.0.1:5051",
            "http://localhost:5051",
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "http://127.0.0.1:8000",
            "http://localhost:8000",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ]
    else:
        origins = [p.strip() for p in str(raw).split(",")]
        origins = [p for p in origins if p]
    pub = (public_url or "").strip().rstrip("/")
    if pub and pub not in origins:
        origins.append(pub)
    return origins


class EapConfig:
    """Immutable-style settings snapshot at import time."""

    ENV: str = os.environ.get("EAP_ENV", "development").strip().lower()
    IS_PRODUCTION: bool = ENV == "production"
    IS_PILOT: bool = _env_bool("EAP_PILOT_MODE") or IS_PRODUCTION

    # Public site URL (https://your-host.example) — auto-added to CORS when set.
    PUBLIC_URL: str | None = (os.environ.get("EAP_PUBLIC_URL") or "").strip().rstrip("/") or None

    # Optional one-switch preset for pilot hosts (also set individual flags explicitly).
    PRODUCTION_PRESET: bool = _env_bool("EAP_PRODUCTION_PRESET")

    SECRET_KEY: str = os.environ.get("EAP_SECRET_KEY", "dev-secret-key-change-before-production")
    PORT: int = int(os.environ.get("PORT", "5051"))
    HOST: str = os.environ.get(
        "EAP_HOST",
        "0.0.0.0" if os.environ.get("EAP_ENV", "").strip().lower() == "production" else "127.0.0.1",
    )

    REQUIRE_SESSION_IDENTITY: bool = _env_bool("EAP_REQUIRE_SESSION_IDENTITY") or (
        PRODUCTION_PRESET and not os.environ.get("EAP_REQUIRE_SESSION_IDENTITY")
    )
    ENFORCE_MEMBERSHIP: bool = _env_bool("EAP_ENFORCE_MEMBERSHIP") or (
        PRODUCTION_PRESET and not os.environ.get("EAP_ENFORCE_MEMBERSHIP")
    )

    DATABASE_BACKEND: str = "sqlite"
    DATABASE_PATH: str = os.environ.get(
        "EAP_DATABASE_PATH",
        os.path.join(_BASE_DIR, "eap_platform.db"),
    )
    # Reserved for Phase G — PostgreSQL driver not wired yet.
    DATABASE_URL: str | None = (os.environ.get("EAP_DATABASE_URL") or "").strip() or None

    UPLOAD_DIR: str = os.environ.get(
        "EAP_UPLOAD_DIR",
        os.path.join(_BASE_DIR, "uploads"),
    )
    SUBMISSIONS_DIR: str = os.environ.get(
        "EAP_SUBMISSIONS_DIR",
        os.path.join(_BASE_DIR, "submissions"),
    )

    CORS_ORIGINS: list[str] = _parse_cors_origins(
        os.environ.get("EAP_CORS_ORIGINS"),
        (os.environ.get("EAP_PUBLIC_URL") or "").strip().rstrip("/") or None,
    )

    SESSION_COOKIE_SECURE: bool = _env_bool("EAP_SESSION_COOKIE_SECURE") or IS_PRODUCTION
    SESSION_COOKIE_SAMESITE: str = os.environ.get("EAP_SESSION_COOKIE_SAMESITE", "Lax").strip() or "Lax"
    TRUST_PROXY: bool = _env_bool("EAP_TRUST_PROXY")

    LOG_LEVEL: str = os.environ.get(
        "EAP_LOG_LEVEL",
        "INFO" if IS_PRODUCTION else "DEBUG",
    ).strip().upper()
    ACCESS_LOG: bool = _env_bool("EAP_ACCESS_LOG", "1" if IS_PRODUCTION else "0")

    FLASK_DEBUG: bool = _env_bool("FLASK_DEBUG") and not IS_PRODUCTION


config = EapConfig()

_DEFAULT_DEV_SECRET = "dev-secret-key-change-before-production"


def setup_logging() -> None:
    level = getattr(logging, config.LOG_LEVEL, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        stream=sys.stdout,
    )
    logging.getLogger("werkzeug").setLevel(logging.WARNING if config.IS_PRODUCTION else logging.INFO)


def validate_production_config() -> None:
    """Log warnings when production is misconfigured (does not exit — host may inject secrets later)."""
    log = logging.getLogger("eap.config")
    if config.DATABASE_URL:
        log.warning(
            "EAP_DATABASE_URL is set but PostgreSQL is not enabled yet. "
            "Pilot uses SQLite at %s",
            config.DATABASE_PATH,
        )
    if config.IS_PILOT and config.PUBLIC_URL:
        log.info("Pilot public URL: %s", config.PUBLIC_URL)
    if not config.IS_PRODUCTION:
        return
    if config.SECRET_KEY == _DEFAULT_DEV_SECRET:
        log.error(
            "EAP_ENV=production but EAP_SECRET_KEY is still the dev default. "
            "Set a long random secret before going live."
        )
    if not config.REQUIRE_SESSION_IDENTITY or not config.ENFORCE_MEMBERSHIP:
        log.warning(
            "Production without EAP_REQUIRE_SESSION_IDENTITY and EAP_ENFORCE_MEMBERSHIP "
            "is not recommended for a public pilot."
        )
