# Vision — Live Teaching: Poll / Quiz / Games (LT track)

**Status:** LT-M1 + **LT-M2** implemented (2026-06-02)  
**Pilot:** Class `EAP047`, HTML lessons on classroom display  

---

## Goal

Teachers launch **Poll**, **Quiz**, and **Games** from Live Teaching with:

1. **AI lesson path** — HTML includes `data-eap-live-tool` slots; teacher picks a slot or clicks **Launch to class** in the iframe; left toolbar pre-fills the question.  
2. **Manual path** — Teacher types question + options in Poll/Quiz panel and launches.  
3. **Segment filter (LT-M2)** — When lesson HTML includes `#eap-lesson-meta` (from LP-M2), Poll/Quiz can filter slots by plan segment.

**Games phase 1 (LT-M2):** `quiz-battle`, `board-race`, `matching-race`, `vocab-bingo`, `treasure-hunt` (from lesson `data-eap-live-game`).

---

## HTML contract (AI generation)

```html
<div class="eap-activity eap-live-slot"
     data-eap-id="live-poll-1"
     data-eap-type="mcq"
     data-eap-live-tool="poll"
     data-eap-live-segment="0"
     data-eap-answer="B">
  <p class="eap-question">Which thesis is strongest?</p>
  <div class="eap-options">
    <button type="button" data-eap-option="A">…</button>
    …
  </div>
  <button type="button" class="eap-live-launch">Launch to class</button>
</div>
```

- `data-eap-live-tool`: `poll` | `quiz` | `game`  
- `data-eap-live-game`: `quiz-battle` | `board-race` | `matching-race` | `vocab-bingo` | `treasure-hunt` (when tool=game)  
- `data-eap-live-segment`: optional 0-based index matching plan `segments[]`  
- `<script id="eap-lesson-meta" type="application/json">` — plan segments + `interaction_slots` (injected by LP-M2 backend)  
- Existing `.eap-activity` MCQ blocks without live-tool are treated as **quiz** slots when parsed.

---

## Frontend modules

| File | Role |
|------|------|
| `eap-live-lesson-slots.js` | Parse HTML + meta → slot list; segment filter |
| `teacher-live-poll-quiz.js` | Poll/Quiz UI (segment select, AI list + manual form) |
| `eap-live-bridge.js` | Student iframe + **Launch to class** postMessage |
| `teacher-live.js` | Wire tools, games suggestions, meta sync |

---

## Later (LT-M3+)

- Live segment filter shared on Games panel toolbar  
- WebSocket student sync for poll/quiz responses  
- Custom game builder ↔ lesson slot binding  

---

*Related: [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md), [`ROADMAP_TEACHER_PHASES.md`](ROADMAP_TEACHER_PHASES.md)*
