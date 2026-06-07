# SS-L1 — Self-study listening (Web)

**Parent:** [`SELF_STUDY_LISTENING.md`](SELF_STUDY_LISTENING.md) · [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database (`backend/self_study_listening.py`)

| Table | Purpose |
|-------|---------|
| `listening_items` | Part 3/4 scripts, questions, exemplar notes, coaching tips |
| `listening_schedules` | Class start date |
| `listening_schedule_days` | Day → item (P3/P4 alternate) |
| `student_listening_progress` | Notes, listen flag, practice scores |

**Seed:** EAP047 — 4 items (2× Part 3, 2× Part 4); days 1–4 mapped.

**Channel:** B only (no manager upload channel for listening).

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/listening/overview` | Part type, today meta |
| GET | `/api/student/self-study/listening/today` | Script + questions (no answers) |
| GET | `/api/student/self-study/listening/coach` | Exemplar notes + tips (after practice) |
| POST | `/api/student/self-study/listening/complete` | Save notes / submit answers |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/self-study/listening/items` | List library |
| GET | `/api/admin/self-study/listening/items/export.csv` | Export for review |

### Frontend

- `js/student-self-study-listening-ui.js` — Listen (script + notes) · Practice · Notes coach
- `js/admin-self-study-listening.js` — item list + CSV export
- Mock fallback when server unavailable

### Web vs App / TTS

| Feature | Web (SS-L1) | Later |
|---------|-------------|-------|
| Audio playback | **Text script** + disclaimer | Tencent TTS + COS/CDN |
| Part 3/4 alternate | Yes (by day number) | Same |
| Self-notes textarea | Yes | Same |
| Exemplar + coaching tips | After submit | Same |
| 19:00 push / streak | No | SS-App |

**External dependency:** Purchase/configure **Tencent Cloud TTS** (and COS) before audio phase — notify coordinator when starting TTS integration.

## UAT

1. `student1` → Listening → Day 1 = Part 3 script → save notes → answer questions → coach tab  
2. Next calendar day (or adjust `start_date`) → Part 4 item  
3. `manager1` → Admin → listening items list + CSV export  

## Next

- **SS-L2** — side-by-side notes compare (V2 in requirements)
- **SS-W1** writing module
- TTS pipeline when Tencent keys available
