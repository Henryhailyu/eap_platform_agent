"""
SS-Sp4 — Tencent Cloud TTS, COS, ASR, SOE (optional) for self-study audio.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import re
import uuid
from typing import Any

from eap_config import config

log = logging.getLogger("eap.tencent_audio")

_TTS_MAX_CHARS = 580
_TTS_REGION = "ap-guangzhou"


def _credentials_ready() -> bool:
    return bool(config.TENCENT_SECRET_ID and config.TENCENT_SECRET_KEY)


def audio_status() -> dict[str, Any]:
    return {
        "audioEnabled": config.AUDIO_ENABLED and _credentials_ready(),
        "tts": config.TTS_ENABLED and _credentials_ready() and bool(config.COS_BUCKET),
        "asr": config.ASR_ENABLED and _credentials_ready(),
        "soe": config.SOE_ENABLED and _credentials_ready(),
        "cosBucket": config.COS_BUCKET or None,
        "cosRegion": config.COS_REGION or None,
    }


def tts_ready() -> bool:
    st = audio_status()
    return bool(st["audioEnabled"] and st["tts"])


def asr_ready() -> bool:
    st = audio_status()
    return bool(st["audioEnabled"] and st["asr"])


def soe_ready() -> bool:
    st = audio_status()
    return bool(st["audioEnabled"] and st["soe"])


def _normalize_prefix(prefix: str | None = None) -> str:
    p = (prefix or config.COS_AUDIO_PREFIX or "self-study/").strip()
    if not p.endswith("/"):
        p += "/"
    return p


def cos_key(*parts: str) -> str:
    prefix = _normalize_prefix()
    clean = [re.sub(r"[^a-zA-Z0-9._/-]", "_", str(p).strip("/")) for p in parts if p]
    return prefix + "/".join(clean)


def _cos_client():
    from qcloud_cos import CosConfig, CosS3Client

    cfg = CosConfig(
        Region=config.COS_REGION,
        SecretId=config.TENCENT_SECRET_ID,
        SecretKey=config.TENCENT_SECRET_KEY,
        Scheme="https",
    )
    return CosS3Client(cfg)


def cos_object_exists(key: str) -> bool:
    try:
        client = _cos_client()
        client.head_object(Bucket=config.COS_BUCKET, Key=key)
        return True
    except Exception:
        return False


def cos_put_bytes(key: str, data: bytes, content_type: str = "audio/mpeg") -> str:
    client = _cos_client()
    client.put_object(
        Bucket=config.COS_BUCKET,
        Body=data,
        Key=key,
        ContentType=content_type,
    )
    return key


def cos_presigned_get_url(key: str, expires: int = 3600) -> str:
    client = _cos_client()
    return client.get_presigned_url(
        Method="GET",
        Bucket=config.COS_BUCKET,
        Key=key,
        Expired=expires,
    )


def chunk_text_for_tts(text: str, max_chars: int = 500) -> list[str]:
    """Split long passages into sentence-bounded chunks for Tencent TTS limits."""
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if not raw:
        return []
    if len(raw) <= max_chars:
        return [raw]
    chunks: list[str] = []
    rest = raw
    while rest:
        if len(rest) <= max_chars:
            chunks.append(rest.strip())
            break
        cut = rest[:max_chars]
        last = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        if last > max_chars // 3:
            piece = rest[: last + 1].strip()
            rest = rest[last + 1 :].strip()
        else:
            piece = cut.strip()
            rest = rest[max_chars:].strip()
        if piece:
            chunks.append(piece)
    return chunks


def expand_playback_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure each segment fits TTS length; preserve speaker/gender metadata."""
    out: list[dict[str, Any]] = []
    for seg in segments or []:
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        speaker = str(seg.get("speaker") or "Speaker").strip()
        gender = str(seg.get("gender") or "female").lower()
        for chunk in chunk_text_for_tts(text):
            out.append({"speaker": speaker, "gender": gender, "text": chunk})
    return out


def _truncate_tts_text(text: str, max_chars: int = _TTS_MAX_CHARS) -> tuple[str, bool]:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if len(raw) <= max_chars:
        return raw, False
    cut = raw[:max_chars]
    last = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if last > max_chars // 2:
        cut = cut[: last + 1]
    return cut.strip(), True


def _voice_id_for_gender(gender: str | None) -> int:
    g = str(gender or "female").lower()
    raw = config.TTS_VOICE_MALE if g == "male" else config.TTS_VOICE_FEMALE
    try:
        return int(raw or config.TTS_VOICE_ID or "101051")
    except (TypeError, ValueError):
        return int(config.TTS_VOICE_ID or "101051")


def synthesize_tts_mp3(text: str, *, voice_type: int | None = None) -> bytes:
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.tts.v20190823 import models, tts_client

    snippet, _ = _truncate_tts_text(text)
    if not snippet:
        raise ValueError("Empty TTS text")

    cred = credential.Credential(config.TENCENT_SECRET_ID, config.TENCENT_SECRET_KEY)
    http_profile = HttpProfile()
    http_profile.endpoint = "tts.tencentcloudapi.com"
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = tts_client.TtsClient(cred, _TTS_REGION, client_profile)

    req = models.TextToVoiceRequest()
    req.Text = snippet
    req.SessionId = str(uuid.uuid4())
    req.ModelType = 1
    req.VoiceType = int(voice_type or config.TTS_VOICE_ID or "101051")
    req.Codec = config.TTS_CODEC
    req.SampleRate = config.TTS_SAMPLE_RATE
    req.PrimaryLanguage = 2  # English

    resp = client.TextToVoice(req)
    if not resp.Audio:
        raise RuntimeError("TTS returned empty audio")
    return base64.b64decode(resp.Audio)


def ensure_tts_audio(cos_subpath: str, text: str, *, voice_type: int | None = None) -> dict[str, Any]:
    """Synthesize if missing; return presigned URL metadata."""
    voice_tag = f"-v{voice_type}" if voice_type is not None else ""
    key = cos_key("tts", f"{cos_subpath}{voice_tag}")
    truncated_text, was_truncated = _truncate_tts_text(text)
    if not cos_object_exists(key):
        audio = synthesize_tts_mp3(truncated_text, voice_type=voice_type)
        cos_put_bytes(key, audio, "audio/mpeg")
        log.info("TTS uploaded to COS: %s (%d bytes)", key, len(audio))
    return {
        "url": cos_presigned_get_url(key),
        "cosKey": key,
        "truncated": was_truncated,
        "available": True,
    }


def ensure_listening_audio(
    item_id: int,
    script_en: str,
    *,
    segments: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    if not tts_ready():
        return None
    try:
        part_segs = expand_playback_segments(segments or [])
        if len(part_segs) > 1:
            audio_segments: list[dict[str, Any]] = []
            for i, seg in enumerate(part_segs):
                text = str(seg.get("text") or "").strip()
                voice = _voice_id_for_gender(seg.get("gender"))
                speaker = str(seg.get("speaker") or f"Part {i + 1}")
                meta = ensure_tts_audio(
                    f"listening/item-{item_id}-seg-{i}.mp3",
                    text,
                    voice_type=voice,
                )
                audio_segments.append(
                    {
                        "url": meta["url"],
                        "speaker": speaker,
                        "gender": seg.get("gender") or "female",
                        "truncated": meta.get("truncated"),
                    }
                )
            if audio_segments:
                return {
                    "playlist": True,
                    "segments": audio_segments,
                    "truncated": any(s.get("truncated") for s in audio_segments),
                    "available": True,
                }
        if len(part_segs) == 1:
            seg = part_segs[0]
            return ensure_tts_audio(
                f"listening/item-{item_id}.mp3",
                str(seg.get("text") or script_en),
                voice_type=_voice_id_for_gender(seg.get("gender")),
            )
        return ensure_tts_audio(f"listening/item-{item_id}.mp3", script_en)
    except Exception as exc:
        log.warning("Listening TTS failed for item %s: %s", item_id, exc)
        return None


def ensure_speaking_prompt_audio(session_id: int, question_id: str, prompt_en: str) -> dict[str, Any] | None:
    if not tts_ready():
        return None
    try:
        safe_q = re.sub(r"[^a-zA-Z0-9_-]", "_", question_id)
        return ensure_tts_audio(f"speaking/session-{session_id}-{safe_q}.mp3", prompt_en)
    except Exception as exc:
        log.warning("Speaking TTS failed %s/%s: %s", session_id, question_id, exc)
        return None


def recognize_speech(audio_bytes: bytes, voice_format: str = "mp3") -> str:
    from tencentcloud.asr.v20190614 import asr_client, models
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile

    if not audio_bytes:
        raise ValueError("Empty audio")
    fmt = (voice_format or "mp3").lower().lstrip(".")
    if fmt == "webm":
        fmt = "mp3"  # browser webm may fail; caller should prefer wav/mp3 when possible

    cred = credential.Credential(config.TENCENT_SECRET_ID, config.TENCENT_SECRET_KEY)
    http_profile = HttpProfile()
    http_profile.endpoint = "asr.tencentcloudapi.com"
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = asr_client.AsrClient(cred, config.TENCENT_REGION, client_profile)

    req = models.SentenceRecognitionRequest()
    req.EngSerViceType = config.ASR_ENGINE
    req.SourceType = 1
    req.VoiceFormat = fmt
    req.Data = base64.b64encode(audio_bytes).decode("ascii")
    req.DataLen = len(audio_bytes)
    resp = client.SentenceRecognition(req)
    text = (resp.Result or "").strip()
    if not text:
        raise RuntimeError("ASR returned empty transcript")
    return text


def store_student_recording(
    student_username: str,
    session_id: int,
    question_id: str,
    audio_bytes: bytes,
    voice_format: str,
) -> str:
    fmt = (voice_format or "webm").lower().lstrip(".")
    digest = hashlib.sha256(audio_bytes).hexdigest()[:12]
    safe_user = re.sub(r"[^a-zA-Z0-9_-]", "_", student_username)
    safe_q = re.sub(r"[^a-zA-Z0-9_-]", "_", question_id)
    key = cos_key("recordings", safe_user, f"session-{session_id}", f"{safe_q}-{digest}.{fmt}")
    ctype = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "webm": "audio/webm",
        "ogg": "audio/ogg",
    }.get(fmt, "application/octet-stream")
    cos_put_bytes(key, audio_bytes, ctype)
    return key


def evaluate_oral_sentence(audio_bytes: bytes, ref_text: str, voice_format: str = "mp3") -> dict[str, Any] | None:
    """SOE sentence-mode evaluation; returns None if disabled or failed."""
    if not soe_ready():
        return None
    try:
        from tencentcloud.common import credential
        from tencentcloud.common.profile.client_profile import ClientProfile
        from tencentcloud.common.profile.http_profile import HttpProfile
        from tencentcloud.soe.v20180724 import models, soe_client

        fmt = (voice_format or "mp3").lower().lstrip(".")
        cred = credential.Credential(config.TENCENT_SECRET_ID, config.TENCENT_SECRET_KEY)
        http_profile = HttpProfile()
        http_profile.endpoint = "soe.tencentcloudapi.com"
        client_profile = ClientProfile()
        client_profile.httpProfile = http_profile
        client = soe_client.SoeClient(cred, config.TENCENT_REGION, client_profile)

        req = models.TransmitOralProcessWithInitRequest()
        req.SeqId = 1
        req.IsEnd = 1
        req.VoiceFileType = 3 if fmt == "mp3" else 2
        req.VoiceEncodeType = 1
        req.UserVoiceData = base64.b64encode(audio_bytes).decode("ascii")
        req.SessionId = str(uuid.uuid4())
        req.RefText = (ref_text or "").strip()[:500]
        req.WorkMode = 1
        req.EvalMode = 1
        req.ScoreCoeff = 3.5
        req.ServerType = 1 if config.SOE_ENGINE.startswith("16k_en") else 0
        if config.SOE_APP_ID:
            req.SoEAppId = config.SOE_APP_ID

        resp = client.TransmitOralProcessWithInit(req)
        return {
            "pronAccuracy": getattr(resp, "PronAccuracy", None),
            "pronFluency": getattr(resp, "PronFluency", None),
            "pronCompletion": getattr(resp, "PronCompletion", None),
            "suggestedScore": getattr(resp, "SuggestedScore", None),
            "sessionId": req.SessionId,
        }
    except Exception as exc:
        log.warning("SOE evaluation failed: %s", exc)
        return None


def merge_soe_into_feedback(feedback: dict[str, Any], soe: dict[str, Any] | None) -> dict[str, Any]:
    if not soe:
        return feedback
    fb = dict(feedback)
    criteria = list(fb.get("criteria") or [])
    pr_band = None
    score = soe.get("suggestedScore")
    if score is not None:
        try:
            pr_band = max(4.0, min(8.0, round(float(score) / 10.0 * 2) / 2))
        except (TypeError, ValueError):
            pr_band = None
    for c in criteria:
        if c.get("id") == "PR" and pr_band is not None:
            c["band"] = pr_band
            c["strengths"] = list(c.get("strengths") or [])
            c["improvements"] = [x for x in (c.get("improvements") or []) if "transcript only" not in x.lower()]
            if score is not None:
                c["strengths"].append(
                    f"SOE practice score {float(score):.1f}/100 "
                    f"(accuracy {soe.get('pronAccuracy')}, fluency {soe.get('pronFluency')})."
                )
            else:
                c["strengths"].append("SOE evaluation completed.")
    fb["criteria"] = criteria
    fb["soe"] = soe
    fb["disclaimerEn"] = (
        "Practice estimate using Tencent SOE + transcript — not an official IELTS score."
    )
    fb["disclaimerZh"] = "基于腾讯云 SOE 与转写的练习估分 — 非官方雅思成绩。"
    return fb
