# SS-R1 — Self-study reading (Web)

**Parent:** [`SELF_STUDY_READING.md`](SELF_STUDY_READING.md) · [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database (`backend/self_study_reading.py`)

| Table | Purpose |
|-------|---------|
| `reading_passages` | Passage + questions JSON (Channel A/B) |
| `reading_schedules` | Per-class schedule start + channel |
| `reading_schedule_days` | Day number → passage (1 passage/day) |
| `student_reading_progress` | Learn + practice scores per passage |

**Seed:** EAP047 — 2 Channel B passages (days 1–2), 1 Channel A manager passage.

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/reading/overview` | Channel, today meta |
| GET | `/api/student/self-study/reading/today` | Passage + questions (no answers) |
| POST | `/api/student/self-study/reading/complete` | Mark read and/or submit answers → auto-score + evidence |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/self-study/reading/passages` | List library |
| PUT | `/api/admin/self-study/reading/push-channel-a` | Enable Channel A for class |
| GET | `/api/admin/self-study/reading/passages/export.csv` | Export for review |

### Frontend

- `js/student-self-study-reading-ui.js` — Read + Practice tabs, per-question evidence feedback
- `js/admin-self-study-reading.js` — manager push + export
- Mock fallback when server unavailable

### Deferred (later SS-R1+)

- OCR upload → paraphrase 3 styles → push workflow
- Full IELTS question types (TFNG, gap-fill word limits, etc.)
- Per-question live AI explanation API
- App 19:00 reminder + streak

## UAT

1. `student1` → Reading → today's passage + MC questions → submit → evidence feedback  
2. `manager1` → Enable reading Channel A EAP047 → student sees Channel A passage  
3. Export CSV lists passages and question keys  

## Next

**SS-L1** listening (text scripts first; Tencent TTS later)
