# Phase N — Tencent VOD setup (录课)

**Parent:** [`CHINA_LIVE_VOD_ROADMAP.md`](CHINA_LIVE_VOD_ROADMAP.md) · [`HTTPS_AFTER_ICP.md`](HTTPS_AFTER_ICP.md)

## What code delivers (N3 + N5)

| API | Purpose |
|-----|---------|
| `POST /api/webhooks/tencent-vod` | Transcode / upload events → update `vod_status` |
| `GET /api/student/recorded-lessons/<id>/play-auth` | Short-lived `psign` for TCPlayer (N5) |
| `POST /api/teacher/recorded-lessons/vod/upload-sign` | ApplyUpload credentials (N2 bridge) |
| `GET /api/teacher/recorded-lessons/vod/status` | Config flags for teacher UI |

**Lesson states:** `local` · `pending` · `transcoding` · `ready` · `failed`

Local uploads still work when `EAP_VOD_ENABLED=0`.

---

## Your steps (Tencent console)

### 1. Open VOD

- [腾讯云点播](https://console.cloud.tencent.com/vod) — same account as COS/TTS
- Note **AppId** (often same as `EAP_TENCENT_APP_ID`)
- Optional **子应用 ID** → `EAP_VOD_SUB_APP_ID`

### 2. Transcode template

- Create HLS template (e.g. 720p) → note template ID → `EAP_VOD_TRANSCODE_TEMPLATE_ID`

### 3. Event callback (N3)

| Field | Value |
|-------|--------|
| URL | `https://elc-eap-platform.top/api/webhooks/tencent-vod` |
| Method | POST JSON |
| Events | 上传完成、任务流状态变更 |
| Callback key | random secret → `EAP_VOD_CALLBACK_KEY` |

Requires **HTTPS + 备案** domain. Test with IP only after temporary HTTP callback (not recommended for production).

### 4. Play anti-hotlink (N5)

- VOD → 分发播放设置 → **Key 防盗链**
- Copy key → `EAP_VOD_PLAY_KEY`

---

## Lighthouse `.env`

```env
EAP_VOD_ENABLED=1
EAP_VOD_APP_ID=1300000000
EAP_VOD_REGION=ap-shanghai
EAP_VOD_PLAY_KEY=your-anti-hotlink-key
EAP_VOD_CALLBACK_KEY=your-callback-key
EAP_VOD_TRANSCODE_TEMPLATE_ID=10
# EAP_VOD_SUB_APP_ID=1500000000
```

Uses existing `EAP_TENCENT_SECRET_ID` / `EAP_TENCENT_SECRET_KEY`.

```bash
cd ~/eap_platform_agent
set -a && source .env && set +a
sudo docker compose up -d --force-recreate
```

---

## Teacher workflow (VOD path — N2 UI)

1. Open **Recorded lessons** (`teacher-recorded.html`) — banner shows when `EAP_VOD_ENABLED=1`
2. Choose a **video** file → form uses **vod-js-sdk-v6** + `upload-sign` + `vod/register`
3. Webhook sets `vod_status=ready` when transcode finishes
4. Student opens `player.html` → `play-auth` → TCPlayer

**Audio** and **VOD off** → existing local multipart upload unchanged.

---

## UAT

```bash
# Config
curl -s -b cookies.txt https://elc-eap-platform.top/api/teacher/recorded-lessons/vod/status

# Simulate webhook (with callback key)
SIGN=$(python3 -c "import hashlib,sys; print(hashlib.md5((open('/dev/stdin').read()).encode()).hexdigest())" <<< "$(cat body.json)")
# Or set EAP_VOD_CALLBACK_KEY empty in pilot only

# Student play-auth (logged in as student1)
curl -s -b student.txt https://elc-eap-platform.top/api/student/recorded-lessons/1/play-auth
```

---

## Next

- **N2** — teacher UI: VOD direct upload button
- **N7** — WeChat built-in browser QA
- **O** — TRTC live after VOD pilot

*Last updated: 2026-06-09*
