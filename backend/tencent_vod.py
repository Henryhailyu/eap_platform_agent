"""
Phase N3/N5 — Tencent Cloud VOD callbacks + short-lived play signatures.
Falls back to local file streaming when VOD is disabled or lesson is local-only.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import random
import time
from typing import Any

from eap_config import config

log = logging.getLogger("eap.tencent_vod")

VOD_STATUS_LOCAL = "local"
VOD_STATUS_PENDING = "pending"
VOD_STATUS_TRANSCODING = "transcoding"
VOD_STATUS_READY = "ready"
VOD_STATUS_FAILED = "failed"

_VALID_VOD_STATUSES = frozenset(
    {VOD_STATUS_LOCAL, VOD_STATUS_PENDING, VOD_STATUS_TRANSCODING, VOD_STATUS_READY, VOD_STATUS_FAILED}
)


def _credentials_ready() -> bool:
    return bool(config.TENCENT_SECRET_ID and config.TENCENT_SECRET_KEY)


def vod_enabled() -> bool:
    return bool(config.VOD_ENABLED and _credentials_ready() and config.VOD_APP_ID)


def vod_status_payload() -> dict[str, Any]:
    return {
        "vodEnabled": vod_enabled(),
        "appId": config.VOD_APP_ID or None,
        "subAppId": config.VOD_SUB_APP_ID or None,
        "region": config.VOD_REGION or None,
        "playKeyConfigured": bool(config.VOD_PLAY_KEY),
        "callbackKeyConfigured": bool(config.VOD_CALLBACK_KEY),
    }


def verify_callback_signature(raw_body: bytes, signature: str | None) -> bool:
    """Tencent VOD optional callback auth: sign = MD5(key + body)."""
    key = (config.VOD_CALLBACK_KEY or "").strip()
    if not key:
        log.warning("EAP_VOD_CALLBACK_KEY unset — accepting VOD webhook without verification (pilot only).")
        return True
    if not signature:
        return False
    digest = hashlib.md5((key + raw_body.decode("utf-8", errors="replace")).encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, signature.strip())


def parse_vod_callback_event(data: dict[str, Any]) -> dict[str, Any] | None:
    """
    Normalize Tencent VOD event notification JSON.
    Returns {file_id, status, message} or None if irrelevant.
    """
    if not isinstance(data, dict):
        return None

    event_type = str(data.get("EventType") or "").strip()

    upload_evt = data.get("FileUploadEvent") or data.get("NewFileUpload") or {}
    if event_type in ("NewFileUpload", "FileUpload") and isinstance(upload_evt, dict):
        file_id = str(upload_evt.get("FileId") or "").strip()
        if file_id:
            return {"file_id": file_id, "status": VOD_STATUS_TRANSCODING, "message": "uploaded"}

    proc_evt = data.get("ProcedureStateChangeEvent") or data.get("ProcedureStateChanged") or {}
    if isinstance(proc_evt, dict):
        file_id = str(proc_evt.get("FileId") or "").strip()
        if not file_id:
            return None
        raw_status = str(proc_evt.get("Status") or proc_evt.get("ErrCode") or "").upper()
        if raw_status == "FINISH" or raw_status == "0":
            return {"file_id": file_id, "status": VOD_STATUS_READY, "message": "transcode finished"}
        if raw_status in ("FAIL", "FAILED") or (raw_status.isdigit() and raw_status != "0"):
            msg = str(proc_evt.get("Message") or proc_evt.get("ErrCodeExt") or "transcode failed")
            return {"file_id": file_id, "status": VOD_STATUS_FAILED, "message": msg}
        return {"file_id": file_id, "status": VOD_STATUS_TRANSCODING, "message": "processing"}

    # Flat fallback used by some console test payloads
    file_id = str(data.get("FileId") or data.get("fileId") or "").strip()
    if file_id:
        status_raw = str(data.get("Status") or data.get("status") or "").lower()
        if status_raw in ("finish", "finished", "success", "ready"):
            return {"file_id": file_id, "status": VOD_STATUS_READY, "message": status_raw}
        if status_raw in ("fail", "failed", "error"):
            return {"file_id": file_id, "status": VOD_STATUS_FAILED, "message": status_raw}
        return {"file_id": file_id, "status": VOD_STATUS_TRANSCODING, "message": status_raw or "processing"}
    return None


def generate_play_psign(file_id: str, *, ttl_seconds: int | None = None) -> str:
    """
    Super Player psign (VOD anti-hotlink Key required).
    See https://cloud.tencent.com/document/product/266/45554
    """
    app_id = int(config.VOD_APP_ID)
    play_key = (config.VOD_PLAY_KEY or "").strip()
    if not play_key:
        raise ValueError("EAP_VOD_PLAY_KEY is required for VOD playback")

    ttl = int(ttl_seconds or config.VOD_PLAY_TTL_SECONDS or 7200)
    now = int(time.time())
    expire = now + max(300, ttl)
    payload = {
        "appId": app_id,
        "fileId": file_id,
        "contentInfo": {
            "audioVideoType": "TranscodeDefinition",
            "transcodeDefinition": int(config.VOD_TRANSCODE_TEMPLATE_ID or 10),
        },
        "currentTimeStamp": now,
        "expireTime": expire,
        "urlAccessInfo": {"t": format(expire, "x")},
    }
    plaintext = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    digest = hmac.new(play_key.encode("utf-8"), plaintext, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    body_b64 = base64.urlsafe_b64encode(plaintext).decode("utf-8").rstrip("=")
    return f"{body_b64}.{sig_b64}"


def build_play_auth(file_id: str, username: str) -> dict[str, Any]:
    psign = generate_play_psign(file_id)
    return {
        "mode": "vod",
        "appId": int(config.VOD_APP_ID),
        "subAppId": int(config.VOD_SUB_APP_ID) if config.VOD_SUB_APP_ID else None,
        "fileId": file_id,
        "psign": psign,
        "player": "tcplayer",
        "username": username,
        "expiresIn": int(config.VOD_PLAY_TTL_SECONDS or 7200),
    }


def generate_client_upload_signature(user_id: str = "eap-teacher") -> str:
    """
    Signature string for Tencent vod-js-sdk-v6 browser upload.
    See https://cloud.tencent.com/document/product/266/9221
    """
    if not vod_enabled():
        raise ValueError("VOD is not configured")
    current = int(time.time())
    expire = current + 3600
    arg_list: dict[str, Any] = {
        "secretId": config.TENCENT_SECRET_ID,
        "currentTimeStamp": current,
        "expireTime": expire,
        "random": random.randint(0, 2**32 - 1),
    }
    if config.VOD_SUB_APP_ID:
        arg_list["vodSubAppId"] = int(config.VOD_SUB_APP_ID)
    if user_id:
        arg_list["sourceContext"] = str(user_id)[:128]
    original = json.dumps(arg_list, separators=(",", ":"))
    digest = hmac.new(
        config.TENCENT_SECRET_KEY.encode("utf-8"),
        original.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest + original.encode("utf-8")).decode("utf-8")


def apply_upload_signature(media_name: str, media_ext: str = "mp4") -> dict[str, Any]:
    """N2 — server-side ApplyUpload for browser direct upload to VOD."""
    if not vod_enabled():
        raise ValueError("VOD is not configured")

    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.vod.v20180717 import models, vod_client

    cred = credential.Credential(config.TENCENT_SECRET_ID, config.TENCENT_SECRET_KEY)
    http = HttpProfile(endpoint="vod.tencentcloudapi.com")
    profile = ClientProfile(httpProfile=http)
    client = vod_client.VodClient(cred, config.VOD_REGION, profile)

    req = models.ApplyUploadRequest()
    req.MediaName = media_name[:128]
    req.MediaType = media_ext.lower().lstrip(".")[:16]
    if config.VOD_SUB_APP_ID:
        req.SubAppId = int(config.VOD_SUB_APP_ID)
    resp = client.ApplyUpload(req)
    return {
        "storageBucket": resp.StorageBucket,
        "storageRegion": resp.StorageRegion,
        "vodSessionKey": resp.VodSessionKey,
        "mediaStoragePath": resp.MediaStoragePath,
        "tempCertificate": {
            "secretId": resp.TempCertificate.SecretId if resp.TempCertificate else None,
            "secretKey": resp.TempCertificate.SecretKey if resp.TempCertificate else None,
            "token": resp.TempCertificate.Token if resp.TempCertificate else None,
            "expiredTime": resp.TempCertificate.ExpiredTime if resp.TempCertificate else None,
        },
    }
