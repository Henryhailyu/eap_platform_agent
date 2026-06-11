# Channel B (AI self-study) — TOTALLY SEALED

**Status:** `TOTALLY SEALED` — verified by owner testing **2026-06-11**  
**Next work:** Channel A fixes only — **do not touch Channel B** unless the owner explicitly unseals.

## Owner directive (2026-06-11)

> Channel B is fine after testing. Channel B should be totally sealed. In the future, if any prompt wants to touch Channel B, the agent must warn the owner: **the changes want to touch Channel B**. We will continue to fix Channel A and not touch Channel B.

## What is Channel B?

| Label | Meaning |
|-------|---------|
| Hub tab | **AI self-study (B)** |
| Vocabulary URL | `?skill=vocabulary&channel=B&day=N` |
| Other skills | `?skill=reading\|listening\|writing\|speaking&day=N` (AI-generated daily content) |
| Data | `vocab_courses`, reading/listening schedules channel `B`, AI writing/speaking flows |

Channel A (**School materials**) is manager-uploaded content and must stay in **separate code paths** (`channel=A`, `source_channel='A'`, pack upload APIs). **All ongoing fixes belong in Channel A paths only.**

## Mandatory agent warning

Before **any** edit, plan, or suggestion that could affect Channel B, the agent **must**:

1. **Stop** and surface this warning to the owner (verbatim lead-in):

   > **⚠️ WARNING: The requested changes want to touch Channel B (AI self-study).**  
   > Channel B is totally sealed. Do you want to proceed? If not, I will limit the work to Channel A only.

2. **Wait for explicit owner approval** before changing code, prompts, APIs, UI, CSS, or AI behaviour for Channel B.

3. If the task can be done **Channel A–only**, do that instead without modifying Channel B branches.

**No silent changes.** Refactors, “shared helper” edits, hub/CSS tweaks, and bug fixes that alter B behaviour all require the warning and approval.

## Sealed scope — all five skills

### Vocabulary
| Layer | Path |
|-------|------|
| Backend | `backend/self_study_vocabulary.py` — `_build_practice_exam_channel_b`, `_meaning_for_channel_b`, `_requested_vocab_channel` when `B`, day/today/calendar/review/grade routes for B |
| Student UI | `frontend/js/student-self-study-vocabulary-ui.js` — `activeChannel === "B"` |
| Styles | `frontend/css/student-self-study.css` — `.ssc-word-grid`, `.ssc-word-card*`, vocab exam/feedback |

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

1. **Channel A work only** by default — use isolated paths (`channel=A`, `_build_practice_exam_channel_a`, pack upload APIs, `admin-self-study-*.js`).
2. **Ask + warn** before any sealed-file edit that could change Channel B UX, APIs, content generation, scoring, or layout.
3. **Do not refactor** shared helpers in ways that change Channel B outputs as a side effect.
4. **Add new Channel A functions** instead of rewriting Channel B paths.
5. **Not sealed** (preferred for new work): `self_study_vocabulary_ai.py`, manager admin upload UIs, Channel A push APIs, `admin-self-study-*.js` — when changes cannot affect B.

## Unseal procedure

1. Owner writes explicitly: **“unseal Channel B”** (optionally naming a skill).
2. Set `STATUS` below to `UNSEALED` and note date + reason.
3. After rehearsal, owner may request re-seal.

```
STATUS: TOTALLY SEALED
VERIFIED: 2026-06-11 (owner testing — Channel B OK)
UNSEAL: (none — Channel A fixes only until owner approves)
```
