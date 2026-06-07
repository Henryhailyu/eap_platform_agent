# SS-Sp1 — Self-study speaking (Web)

**Parent:** [`SELF_STUDY_SPEAKING.md`](SELF_STUDY_SPEAKING.md) · [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database (`backend/self_study_speaking.py`)

| Table | Purpose |
|-------|---------|
| `speaking_sessions` | Part 1 sessions with questions JSON |
| `student_speaking_responses` | Typed answers + rubric feedback |

**Seed:** EAP047 — two Part 1 sessions (4 questions each, 60s limit).

**Channel:** B only · **No daily push / streak.**

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/speaking/overview` | Session list + response count |
| GET | `/api/student/self-study/speaking/sessions/<id>` | Questions + prior responses |
| POST | `/api/student/self-study/speaking/respond` | Submit typed answer → IELTS 4-criteria feedback |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/self-study/speaking/sessions` | List sessions |
| GET | `/api/admin/self-study/speaking/sessions/export.csv` | Export for review |

### Frontend

- `js/student-self-study-speaking-ui.js` — Sessions hub · Practice · 60s timer · Feedback
- `js/admin-self-study-speaking.js` — session list + CSV export
- Mock fallback when server unavailable (`student-self-study-speaking-mock.js`)

### Feedback (MVP)

Rule-based practice bands for **FC / LR / GRA / PR** using word count, sentence length, linking phrases, and fluency heuristics. Disclaimer: not official IELTS. Live AI + Tencent STT/SOE can replace `_build_feedback` later.

### Web MVP scope

- Text question on screen (TTS deferred)
- Student types spoken response (STT deferred)
- 60s countdown per Part 1 question; auto-submit on timeout

### Deferred

- Part 2 cue card + prep timer + 2 min long turn
- Part 3 discussion questions
- Full mock (P1 → P2 → P3)
- Tencent TTS question playback
- Browser/App recording + ASR/SOE
- Live AI question generation

## UAT

1. `student1` → Speaking → open Part 1 session → start timer → type 30+ words → FC/LR/GRA/PR feedback
2. Complete all questions in a session
3. `manager1` → export sessions CSV

## Next

**SS-Sp2** Part 2 cue card · **SS-Sp3** Part 3 · **SS-Sp4** full mock · Tencent TTS/STT/SOE when keys available
