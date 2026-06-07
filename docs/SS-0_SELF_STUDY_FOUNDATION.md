# SS-0 — Self-Study foundation (Web)

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database

- `student_placement_results` — placement scores + `vocab_entry_level` (≤40%)
- `student_self_study_settings` — `subscribed`, `timezone`, `holiday_review_mode`
- `self_study_skill_push` — manager per-class per-skill Channel A push flag

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/status` | Placement + settings + unlocked |
| GET/POST | `/api/student/self-study/placement` | Load / save placement |
| PATCH | `/api/student/self-study/settings` | Subscribe / timezone / holiday mode |
| GET | `/api/student/self-study/daily-overview` | Per-skill channel A/B + Web manual review hints |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/self-study/push-flags` | List push flags (`?class_name=`) |
| PUT | `/api/admin/self-study/push-flags` | Set `{ className, skill, isActive, notes? }` |

### Frontend

- `js/student-self-study-server.js` — API client
- Hub + placement wired to server (sessionStorage fallback offline)

## UAT

1. `student1` complete placement → POST succeeds → hub hides CTA banner  
2. GET `daily-overview` → vocabulary/reading channel B unless manager push  
3. Manager PUT push flag vocabulary EAP047 → student overview shows channel A for vocab  
4. PATCH `subscribed: false` → `selfStudyUnlocked` false  

## Next: SS-V1 vocabulary
