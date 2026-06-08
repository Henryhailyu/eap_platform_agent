# SS-Sp4 — Tencent audio (TTS / COS / ASR / SOE)

**Parent:** [`SS-Sp1_SELF_STUDY_SPEAKING.md`](SS-Sp1_SELF_STUDY_SPEAKING.md) · [`SS-Sp4_TENCENT_PROCUREMENT_CHECKLIST.md`](SS-Sp4_TENCENT_PROCUREMENT_CHECKLIST.md)

## Delivered

### Backend

| Module | Purpose |
|--------|---------|
| `tencent_audio.py` | TTS → COS, presigned URLs, ASR, SOE merge |
| `tencent_audio_routes.py` | `GET /api/student/self-study/audio/status` |
| `eap_config.py` | `EAP_TENCENT_*`, `EAP_COS_*`, `EAP_TTS_*`, `EAP_ASR_*`, `EAP_SOE_*` |
| `self_study_listening.py` | Today's item includes `audio` URL when TTS enabled |
| `self_study_speaking.py` | Prompt TTS, recording upload, ASR transcript, SOE PR |

**Dependencies:** `tencentcloud-sdk-python`, `cos-python-sdk-v5`

### Behaviour

| Feature | When enabled | Fallback |
|---------|--------------|----------|
| Listening TTS | `EAP_TTS_ENABLED=1` + COS + keys | Text script disclaimer |
| Speaking question TTS | Same | Text prompt |
| Speaking record + ASR | `EAP_ASR_ENABLED=1` | Typed response only |
| SOE pronunciation | `EAP_SOE_ENABLED=1` | Rule-based PR disclaimer |

Listening audio uses first ~580 characters of `scriptEn` (sentence boundary); full script remains on screen.

Recordings stored at `self-study/recordings/{user}/session-{id}/{question}.{fmt}`.

### Student API (additions)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/student/self-study/audio/status` | tts/asr/soe flags |
| GET | `/api/student/self-study/listening/today` | + `audio`, `audioStatus` |
| GET | `/api/student/self-study/speaking/sessions/<id>` | items + `promptAudio` |
| POST | `/api/student/self-study/speaking/respond` | + `audioBase64`, `audioFormat` |

### Frontend

- `student-self-study-listening-ui.js` — `<audio>` player
- `student-self-study-speaking-ui.js` — play question, MediaRecorder, submit audio

### Docker

`docker-compose.yml` passes all `EAP_TENCENT_*` / COS / TTS / ASR / SOE vars from `.env`.

## UAT (Lighthouse)

1. `curl` or browser: `/api/student/self-study/audio/status` → `tts: true`
2. **Listening** → today's item → play TTS audio + read script
3. **Speaking** → play question → record → submit → transcript + SOE-enhanced PR (if SOE on)
4. COS console → objects under `self-study/tts/` and `self-study/recordings/`

## Deferred

- CDN custom domain for audio (`audio.elc-eap-platform.top`)
- Full-script long TTS (chunk concat)
- WebM → WAV server transcode for ASR compatibility
- SOE WebSocket streaming for live feedback
- Recording replay in feedback UI

## Next

- **备案通过后** HTTPS + `EAP_PUBLIC_URL=https://elc-eap-platform.top` (microphone requires secure context on some browsers)
- Polish: recording waveform, replay own answer
