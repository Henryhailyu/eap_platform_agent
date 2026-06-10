# Channel B vocabulary — SEALED until rehearsal

**Status:** Frozen as of 2026-06-10. Do not modify Channel B vocabulary student experience until rehearsal is complete and the team explicitly unseals this document.

## What is Channel B?

- Student URL: `student-self-study-module.html?skill=vocabulary&channel=B&day=N`
- AI course from `vocab_courses` / `vocab_course_days`
- Separate from Channel A (`channel=A`, manager packs)

## Sealed files (do not edit for Channel A work)

| Area | Path |
|------|------|
| Channel B exam builder | `backend/self_study_vocabulary.py` → `_build_practice_exam_channel_b`, `_meaning_for_channel_b` |
| Channel B day/today/calendar/review routes | same file, branches where `_requested_vocab_channel(...) == "B"` |
| Channel B student UI | `frontend/js/student-self-study-vocabulary-ui.js` (when `activeChannel === "B"`) |
| Word card layout | `frontend/css/student-self-study.css` → `.ssc-word-grid`, `.ssc-word-card*` |
| Channel B API client | `frontend/js/student-self-study-server.js` → `getVocabToday/Day/Calendar/Review*` with `channel=B` |

## Allowed changes

- Channel A only (`channel=A` paths, manager admin, `self_study_vocabulary_ai.py`)
- Reading / listening / speaking / writing modules (unchanged by this seal)
- Bug fixes **only** if Channel B is broken and user explicitly approves unsealing

## Unseal procedure

1. User says "unseal Channel B vocabulary"
2. Update this file status to `UNSEALED`
3. Make changes; re-seal after rehearsal if requested
