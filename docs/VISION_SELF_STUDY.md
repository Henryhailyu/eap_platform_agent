# VISION — Student AI Self-Study Centre

**Purpose:** IELTS-aligned EAP self-study (vocabulary, reading, listening, writing) — separate from class calendar homework.  
**Pilot class examples:** `EAP047` (high, ~IELTS 6.5) · `EAP039` (foundation, ~IELTS 5.0)  
**Status:** Requirements locked (2026-06) — implementation pending  
**Related:** [`EAP_Student_AI_Self_Study_Centre_Design_Brief.txt`](../EAP_Student_AI_Self_Study_Centre_Design_Brief.txt) · Phase S2 placement mock · Phase S4 module mocks

---

## Module index

| Module | Doc | Daily push (App) |
|--------|-----|------------------|
| Vocabulary | [`SELF_STUDY_VOCABULARY.md`](SELF_STUDY_VOCABULARY.md) | 19:00 new words + 2h review |
| Reading | [`SELF_STUDY_READING.md`](SELF_STUDY_READING.md) | 19:00 · ≥1 passage/day |
| Listening | [`SELF_STUDY_LISTENING.md`](SELF_STUDY_LISTENING.md) | 19:00 · Part 3/4 alternate |
| Writing | [`SELF_STUDY_WRITING.md`](SELF_STUDY_WRITING.md) | **None** — student-led |
| Speaking | [`SELF_STUDY_SPEAKING.md`](SELF_STUDY_SPEAKING.md) | **None** — IELTS simulator |

---

## Entry: Placement Test

**Current implementation:** Phase S2 mock — `student-self-study-placement.html` + `student-self-study-mock.js` (~20 min, 21 questions, sessionStorage).

| Part | Duration | Questions |
|------|----------|-----------|
| Vocabulary | ~5 min | 6 |
| Reading | ~6 min | 5 + passage |
| Listening | ~5 min | 5 + script (text) |
| Writing | ~4 min | 5 sentence tasks |
| **Total** | **~20 min** | **21** |

**Scoring (mock):** total ≤40% → `beginner` · 41–70% → `intermediate` · >70% → `advanced`.

### Rules (locked)

| Rule | Behaviour |
|------|-----------|
| Incomplete placement | Self-study **not auto-started**; App/mini-program shows opt-in reminder only |
| **Completed** placement (any score) | Self-study **unlocked**; App push begins per module rules |
| Score **&lt; 40%** | **Vocabulary only:** entry-level pedagogy (more affix/mnemonic scaffolding); **same class word list** |
| Reading / listening / writing | **No levelling** by placement score or skill profile |
| Retake | Allowed (replaces previous demo result) |

---

## Cross-module rules

### Daily channel routing (“今日任务”)

Per skill, **automatic** — student does not pick A/B manually:

```
daily_channel(skill) = manager_has_push(skill) ? 'A' : 'B'
```

| Example | Vocabulary | Reading |
|---------|------------|---------|
| Vocab pushed, reading not | A | B |
| Neither pushed | B | B |
| Both pushed | A | A |

- **Writing / listening (current):** AI-only → always **Channel B**
- Channel A browse allowed; only the routed channel counts for **daily completion / Streak** (where Streak applies)

### Manager

- **Push permission:** Manager only  
- **Channel B review:** AI draft → export (Word/Excel) → edit/re-upload → approve → push  
- **Class scope:** Separate word lists, reading sets, listening queues, writing genre pools per class  

### Placement & classes

- Class metadata (e.g. EAP047 ≈ 6.5, EAP039 ≈ 5.0) drives **AI generation prompts**, not per-student placement tiers for reading/listening/writing  

### Holidays

- **Stop** scheduled pushes (new content + 2h review for vocabulary)  
- App: voluntary **假期复习模式** (review only, no new items)  
- Web: manual access; no timed reminders  

### Timezone

- All **19:00 / 22:00 / 07:00** push windows: **student local time** (App / mini-program)  

### Unsubscribe

- Student sets `self_study_subscribed = false` → stop App/mini-program pushes  
- Web history / manual practice: TBD per module (default: allow review, no nudges)  

### Platform matrix

| Capability | Web | App / 微信小程序 |
|------------|-----|------------------|
| Module practice | ✅ | ✅ |
| 19:00 (and 2h vocab) push | ❌ | ✅ |
| Holiday review mode | ✅ entry | ✅ |
| Streak | where defined | ✅ |

---

## Week 0 → Week 1 lifecycle

```
Week 0: Manager configures AI prompts, approves vocab month / reading sets / listening queue / writing pool
Week 1+: Students with placement complete → self-study active + pushes (except writing)
Students without placement → reminder only until test complete
```

---

## Implementation phases (indicative)

| Phase | Scope |
|-------|--------|
| **SS-V1** | Vocabulary Channel A/B, analytics, weekly calendar, placement gate (server) |
| **SS-R1** | Reading dual channel, IELTS question schema, paraphrase pipeline, daily passage |
| **SS-L1** | Listening Part 3/4, Tencent TTS, note-taking system, self-notes V1 |
| **SS-L2** | Student notes vs AI exemplar comparison |
| **SS-W1** | Writing genres, pre-writing coach, submit + IELTS rubric feedback, 1–2 revisions |
| **SS-Sp1–Sp4** | Speaking simulator: TTS questions, record + timers, STT, IELTS 4-criteria feedback |
| **SS-App** | Push scheduler, Streak, holiday mode, local timezone |

**External dependency:** Tencent Cloud **TTS** (+ COS) for listening + speaking question playback; **ASR** (+ optional **SOE**) for speaking — purchase when SS-L1 / SS-Sp1 starts.

---

## Open items (implementation detail)

| Item | Default until changed |
|------|------------------------|
| 19:00 no main-task selected (vocab) | Default Channel B |
| Manager reorders reading mid-term | New order from next calendar day |
| Approved material version change | Lock enrolled students to approved version for term |

---

## Changelog

| Date | Note |
|------|------|
| 2026-06 | Requirements consolidated (vocab, reading, listening, writing, speaking) |
