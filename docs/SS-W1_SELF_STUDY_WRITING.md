# SS-W1 — Self-study writing (Web)

**Parent:** [`SELF_STUDY_WRITING.md`](SELF_STUDY_WRITING.md) · [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database (`backend/self_study_writing.py`)

| Table | Purpose |
|-------|---------|
| `writing_tasks` | Genre, prompt, pre-coach JSON, word minimum |
| `student_writing_submissions` | Drafts + rubric feedback (up to 3 revisions) |

**Seed:** EAP047 — IELTS Task 2 essay, summary, research proposal.

**Channel:** B only · **No daily push / streak.**

### Genre rotation (UTC weekday)

| Day | Genre |
|-----|--------|
| Monday | `IELTS_T2_ESSAY` |
| Wednesday | `SUMMARY` |
| Friday | `PROPOSAL` |
| Other | Student picks from library |

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/writing/overview` | Suggested task + library |
| GET | `/api/student/self-study/writing/tasks/<id>` | Prompt + pre-coach + submission history |
| POST | `/api/student/self-study/writing/submit` | Draft → IELTS 4-criteria feedback |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/self-study/writing/tasks` | List tasks |
| GET | `/api/admin/self-study/writing/tasks/export.csv` | Export for review |

### Frontend

- `js/student-self-study-writing-ui.js` — Library · Plan · Draft · Feedback
- `js/admin-self-study-writing.js` — task list + CSV export
- Mock fallback when server unavailable

### Feedback (MVP)

Rule-based practice bands for **TR / CC / LR / GRA** using word count, paragraphing, connectors, and lexis heuristics. Disclaimer: not official IELTS. Live AI rubric can replace `_build_feedback` later.

### Deferred

- Word/PDF upload extraction
- Live AI pre-coach + paragraph feedback
- Side-by-side revision delta
- Calendar homework independence already enforced (separate tables)

## UAT

1. `student1` → Writing → open Monday essay → plan → draft 250+ words → four criteria feedback  
2. Revise and resubmit (max 3)  
3. Wednesday/Friday suggested genre matches weekday  
4. `manager1` → export CSV  

## Next

**SS-Sp1** speaking simulator (Tencent ASR/SOE + TTS when keys available)
