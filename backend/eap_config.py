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


def _load_local_env_file() -> None:
    """Load backend/.env when variables are not already set (local dev; file is gitignored)."""
    env_path = os.path.join(_BASE_DIR, ".env")
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                if not key or key in os.environ:
                    continue
                val = value.strip()
                if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                    val = val[1:-1]
                os.environ[key] = val
    except OSError as exc:
        logging.getLogger("eap.config").warning("Could not read %s: %s", env_path, exc)


_load_local_env_file()


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

    # Public site URL — auto-added to CORS. Render sets RENDER_EXTERNAL_URL on first deploy.
    PUBLIC_URL: str | None = (
        (os.environ.get("EAP_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "")
        .strip()
        .rstrip("/")
        or None
    )

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
        PUBLIC_URL,
    )

    # Default to Secure in production, but allow explicit EAP_SESSION_COOKIE_SECURE=0
    # for HTTP-only pilots (e.g. IP:port before a domain + HTTPS is set up).
    SESSION_COOKIE_SECURE: bool = _env_bool(
        "EAP_SESSION_COOKIE_SECURE", "1" if IS_PRODUCTION else "0"
    )
    SESSION_COOKIE_SAMESITE: str = os.environ.get("EAP_SESSION_COOKIE_SAMESITE", "Lax").strip() or "Lax"
    TRUST_PROXY: bool = _env_bool("EAP_TRUST_PROXY")

    LOG_LEVEL: str = os.environ.get(
        "EAP_LOG_LEVEL",
        "INFO" if IS_PRODUCTION else "DEBUG",
    ).strip().upper()
    ACCESS_LOG: bool = _env_bool("EAP_ACCESS_LOG", "1" if IS_PRODUCTION else "0")

    FLASK_DEBUG: bool = _env_bool("FLASK_DEBUG") and not IS_PRODUCTION

    # Phase I2a: Bearer access_token lifetime for /api/v1/auth/* (seconds).
    TOKEN_TTL_SECONDS: int = int(os.environ.get("EAP_TOKEN_TTL_SECONDS", str(7 * 24 * 3600)))

    # Comma-separated manager usernames allowed to create/delete other manager accounts.
    MANAGER_SUPER_USERNAMES: frozenset[str] = frozenset(
        u.strip().lower()
        for u in (os.environ.get("EAP_MANAGER_SUPER_USERNAMES") or "manager1").split(",")
        if u.strip()
    )

    # Manager accounts that can never be deleted (anchor super-manager; default manager1).
    MANAGER_PROTECTED_USERNAMES: frozenset[str] = frozenset(
        u.strip().lower()
        for u in (os.environ.get("EAP_MANAGER_PROTECTED_USERNAMES") or "manager1").split(",")
        if u.strip()
    )

    # Phase K2 — AI (OpenAI-compatible; keys never stored in source code).
    AI_ENABLED: bool = _env_bool("EAP_AI_ENABLED")
    AI_PROVIDER: str = (os.environ.get("EAP_AI_PROVIDER") or "deepseek").strip().lower()
    AI_MODEL: str = (os.environ.get("EAP_AI_MODEL") or "deepseek-chat").strip()
    OPENAI_API_KEY: str = (os.environ.get("EAP_OPENAI_API_KEY") or "").strip()
    OPENAI_BASE_URL: str = (os.environ.get("EAP_OPENAI_BASE_URL") or "").strip().rstrip("/")
    OPENAI_MODEL: str = (os.environ.get("EAP_OPENAI_MODEL") or "gpt-4o-mini").strip()
    DEEPSEEK_API_KEY: str = (os.environ.get("EAP_DEEPSEEK_API_KEY") or "").strip()
    DEEPSEEK_BASE_URL: str = (os.environ.get("EAP_DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip().rstrip("/")
    DEEPSEEK_MODEL: str = (os.environ.get("EAP_DEEPSEEK_MODEL") or "deepseek-chat").strip()

    # SS-Sp4 — Tencent TTS / COS / ASR / SOE
    AUDIO_ENABLED: bool = _env_bool("EAP_AUDIO_ENABLED")
    TENCENT_SECRET_ID: str = (os.environ.get("EAP_TENCENT_SECRET_ID") or "").strip()
    TENCENT_SECRET_KEY: str = (os.environ.get("EAP_TENCENT_SECRET_KEY") or "").strip()
    TENCENT_APP_ID: str = (os.environ.get("EAP_TENCENT_APP_ID") or "").strip()
    TENCENT_REGION: str = (os.environ.get("EAP_TENCENT_REGION") or "ap-shanghai").strip()
    COS_BUCKET: str = (os.environ.get("EAP_COS_BUCKET") or "").strip()
    COS_REGION: str = (os.environ.get("EAP_COS_REGION") or TENCENT_REGION).strip()
    COS_AUDIO_PREFIX: str = (os.environ.get("EAP_COS_AUDIO_PREFIX") or "self-study/").strip()
    TTS_ENABLED: bool = _env_bool("EAP_TTS_ENABLED")
    TTS_VOICE_ID: str = (os.environ.get("EAP_TTS_VOICE_ID") or "101051").strip()
    TTS_VOICE_MALE: str = (os.environ.get("EAP_TTS_VOICE_MALE") or os.environ.get("EAP_TTS_VOICE_ID") or "101051").strip()
    TTS_VOICE_FEMALE: str = (os.environ.get("EAP_TTS_VOICE_FEMALE") or "101050").strip()
    TTS_SAMPLE_RATE: int = int(os.environ.get("EAP_TTS_SAMPLE_RATE", "16000") or "16000")
    TTS_CODEC: str = (os.environ.get("EAP_TTS_CODEC") or "mp3").strip()
    ASR_ENABLED: bool = _env_bool("EAP_ASR_ENABLED")
    ASR_ENGINE: str = (os.environ.get("EAP_ASR_ENGINE") or "16k_en").strip()
    SOE_ENABLED: bool = _env_bool("EAP_SOE_ENABLED")
    SOE_APP_ID: str = (os.environ.get("EAP_SOE_APP_ID") or TENCENT_APP_ID).strip()
    SOE_ENGINE: str = (os.environ.get("EAP_SOE_ENGINE") or "16k_en").strip()
    SPEAKING_AUDIO_RETENTION_DAYS: int = int(os.environ.get("EAP_SPEAKING_AUDIO_RETENTION_DAYS", "90") or "90")

    # Phase N — Tencent VOD (recorded lessons)
    VOD_ENABLED: bool = _env_bool("EAP_VOD_ENABLED")
    VOD_APP_ID: str = (
        os.environ.get("EAP_VOD_APP_ID") or os.environ.get("EAP_TENCENT_APP_ID") or ""
    ).strip()
    VOD_SUB_APP_ID: str = (os.environ.get("EAP_VOD_SUB_APP_ID") or "").strip()
    VOD_REGION: str = (os.environ.get("EAP_VOD_REGION") or TENCENT_REGION).strip()
    VOD_PLAY_KEY: str = (os.environ.get("EAP_VOD_PLAY_KEY") or "").strip()
    VOD_CALLBACK_KEY: str = (os.environ.get("EAP_VOD_CALLBACK_KEY") or "").strip()
    VOD_PLAY_TTL_SECONDS: int = int(os.environ.get("EAP_VOD_PLAY_TTL_SECONDS", "7200") or "7200")
    VOD_TRANSCODE_TEMPLATE_ID: int = int(
        os.environ.get("EAP_VOD_TRANSCODE_TEMPLATE_ID", "10") or "10"
    )


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
    if config.AI_ENABLED and not (
        config.DEEPSEEK_API_KEY or config.OPENAI_API_KEY
    ):
        log.warning(
            "EAP_AI_ENABLED=1 but no EAP_DEEPSEEK_API_KEY or EAP_OPENAI_API_KEY — "
            "AI lesson generator and coaches will return 503 until a key is set in the host dashboard."
        )
    if config.AUDIO_ENABLED and not (config.TENCENT_SECRET_ID and config.TENCENT_SECRET_KEY):
        log.warning(
            "EAP_AUDIO_ENABLED=1 but EAP_TENCENT_SECRET_ID/KEY missing — audio falls back to text-only."
        )
    if config.TTS_ENABLED and config.AUDIO_ENABLED and not config.COS_BUCKET:
        log.warning("EAP_TTS_ENABLED=1 but EAP_COS_BUCKET missing — TTS playback disabled.")
    if config.VOD_ENABLED and not (config.TENCENT_SECRET_ID and config.TENCENT_SECRET_KEY):
        log.warning("EAP_VOD_ENABLED=1 but Tencent credentials missing — VOD disabled.")
    if config.VOD_ENABLED and not config.VOD_PLAY_KEY:
        log.warning("EAP_VOD_ENABLED=1 but EAP_VOD_PLAY_KEY missing — student VOD play-auth will fail.")
