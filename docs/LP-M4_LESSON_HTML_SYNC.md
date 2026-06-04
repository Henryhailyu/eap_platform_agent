# LP-M4 — Real-time lesson HTML sync

**Status:** Implemented (2026-06-04) · long-poll (no WebSocket)  
**Pilot:** Teacher Live + student Live with HTML lesson on display  

---

## What it does

When the teacher pushes an **HTML lesson** to the class:

| Action | Teacher | Students (~35) |
|--------|---------|----------------|
| **Show answer** (`.eap-reveal` button) | Click in Live preview iframe | Same target revealed within ~25s (long-poll) |
| **Focus segment** | Toolbar: segment dropdown → **Show to class** | Blocks with other `data-eap-live-segment` values dimmed |

Uses the same **live session code** as timer/display sync. Resets when teacher pushes a new HTML lesson to the class.

---

## API

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/teacher/live/sessions/<code>/lesson-sync` | Teacher — body `{ "patch": { "reveal": "#ans-1", "reveals": ["#a"], "active_segment": 2, "active_segment": null } }` |
| `GET` | `/api/student/live/join/<code>/wait-lesson-sync?since_version=0&timeout=25` | Student — long-poll until `lesson_sync_version` changes |

`lesson_sync` is also included on student join payloads when `display.mode === "html"`.

---

## DB

`live_sessions.lesson_sync_json`, `live_sessions.lesson_sync_version` (migration `migrate_live_lp4`).

State shape:

```json
{ "reveals": ["#ans-q1"], "active_segment": 2 }
```

`active_segment: null` → all segments visible.

---

## Frontend

| File | Role |
|------|------|
| `js/eap-live-bridge.js` | Teacher reveal → POST; student long-poll + apply state |
| `js/live-teaching-api.js` | `pushLessonSync`, `studentWaitLessonSync` |
| `js/teacher-live.js` | Segment toolbar on HTML canvas |
| `js/student-live.js` | `postMessage` lesson_sync into iframe |

Cache-bust: `eap-live-bridge.js?v=20260604-lp4`

---

## UAT (EAP047)

1. Deploy latest `main` + Docker rebuild.  
2. Teacher Live → push HTML lesson with `data-eap-live-segment` blocks and `.eap-reveal` buttons.  
3. Students join Live with class code.  
4. Teacher clicks **Show answer** in preview → students see answer without refreshing.  
5. Teacher picks **Segment 2** → **Show to class** → other segments dim on student lesson iframe.  
6. Teacher selects **All segments visible** → **Show to class** → full page visible again.

---

*Related: [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md) Phase B · [`ROADMAP_TEACHER_PHASES.md`](ROADMAP_TEACHER_PHASES.md)*
