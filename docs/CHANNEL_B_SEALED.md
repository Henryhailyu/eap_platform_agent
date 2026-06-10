# Channel B (AI self-study) — SEALED until rehearsal

**Status:** `SEALED` — effective 2026-06-10  
**Owner approval required** before any change that affects Channel B student or manager-visible Channel B behaviour.

## What is Channel B?

| Label | Meaning |
|-------|---------|
| Hub tab | **AI self-study (B)** |
| Vocabulary URL | `?skill=vocabulary&channel=B&day=N` |
| Other skills | `?skill=reading|listening|writing|speaking&day=N` (AI-generated daily content) |
| Data | `vocab_courses`, reading/listening schedules channel `B`, AI writing/speaking flows |

Channel A (**School materials**) is manager-uploaded content and must stay in **separate code paths** (`channel=A`, `source_channel='A'`, pack upload APIs). Do not alter Channel B when fixing Channel A.

## Sealed scope — all five skills

### Vocabulary
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_vocabulary.py` — `_build_practice_exam_channel_b`, `_meaning_for_channel_b`, `_requested_vocab_channel` when `B`, day/today/calendar/review routes for B |
| Student UI | `frontend/js/student-self-study-vocabulary-ui.js` — `activeChannel === "B"` |
| Styles | `frontend/css/student-self-study.css` — `.ssc-word-grid`, `.ssc-word-card*` |

### Reading
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_reading.py` — schedule/passage routes where `channel='B'` |
| AI | `backend/self_study_reading_ai.py` |
| Student UI | `frontend/js/student-self-study-reading-ui.js` |

### Listening
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_listening.py` |
| AI | `backend/self_study_listening_ai.py` |
| Student UI | `frontend/js/student-self-study-listening-ui.js` |

### Writing
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_writing.py` |
| AI | `backend/self_study_writing_ai.py` |
| Student UI | `frontend/js/student-self-study-writing-ui.js` |

### Speaking
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_speaking.py` |
| AI | `backend/self_study_speaking_ai.py` |
| Student UI | `frontend/js/student-self-study-speaking-ui.js` |

### Shared (Channel B hub & API client)
| Layer | Path |
|-------|------|
| Hub | `frontend/js/student-self-study-hub.js` — Channel B tab, `channel=B` links, B calendar |
| API client | `frontend/js/student-self-study-server.js` — student self-study fetch helpers |
| Overview | `backend/self_study.py` — daily overview / channel routing used by hub |
| Shared CSS | `frontend/css/student-self-study.css` — exam, reading, listening, speaking layouts used by B |

## Agent / developer rules

1. **Ask the user for permission** before editing any sealed file if the diff could change Channel B UX, APIs, content generation, scoring, or layout.
2. **Do not refactor** shared helpers in ways that change Channel B outputs “as a side effect”.
3. **Channel A work only** in clearly marked A branches; add new functions instead of rewriting B paths.
4. **Not sealed** (safe for Channel A / admin work): `self_study_vocabulary_ai.py`, manager admin upload UIs, Channel A push APIs, `admin-self-study-*.js`.

## Unseal procedure

1. User writes: **“unseal Channel B”** (optionally naming a skill: vocabulary, reading, …).
2. Set status below to `UNSEALED` and note date + reason.
3. After rehearsal, user may request re-seal.

```
STATUS: SEALED
UNSEAL: (none)
```
