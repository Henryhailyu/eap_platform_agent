# VISION — Student AI Self-Study Centre

**Purpose:** IELTS-aligned EAP self-study (vocabulary, reading, listening, writing) — separate from class calendar homework.  
**Pilot class examples:** `EAP047` (high, ~IELTS 6.5) · `EAP039` (foundation, ~IELTS 5.0)  
**Status:** Requirements locked (2026-06) — **SS-0 in progress** (Web-first)  
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

| Capability | Web (Phase 1) | App / 微信小程序 (Phase 2) |
|------------|-----------------|---------------------------|
| Module practice | ✅ | ✅ later |
| Today’s task API | ✅ | ✅ same API + push |
| 19:00 (and 2h vocab) push | ❌ | ✅ SS-App |
| Vocab 2h review | **Manual** “复习昨日” page (方案 A) | Scheduled push later |
| Holiday review mode | ✅ entry | ✅ later |
| Streak | ✅ server-backed | ✅ + notifications later |
| Teacher message push | Web inbox later | SS-Teacher + SS-App |

---

## Delivery strategy — Web-first, App deferred

**Decision (2026-06):** Complete the **full Web** student + manager self-study loop before **App / 微信小程序** or **teacher push** channels.

| Phase | What ships |
|-------|------------|
| **Web Phase 1** | SS-0 → SS-V1 → SS-R1 → SS-L1 → SS-W1 → SS-Sp* on `/ui/` |
| **Phase 2** | SS-App (19:00, 2h vocab, local timezone, device tokens) |
| **Phase 2+** | Teacher notification push (may share notification service with SS-App) |

**Why:** Lighthouse / browser pilot; one business-logic API for Web and mobile later.

**Web Phase 1 rules:**

- **All “what to study today” logic lives on the server** (`daily_channel`, task queues). Web calls the same endpoints App will use later.
- **Push tables / `subscribed` / `timezone` may be created early**; schedulers and FCM/厂商通道 stay off until SS-App.
- **词汇 2h 复习 — 方案 A:** Web shows **manual “复习昨日词”** (and weekend review entry); no browser timers pretending to be App push.
- **写作 / 口语:** no push in any phase — unchanged.

---

## Week 0 → Week 1 lifecycle

```
Week 0: Manager configures AI prompts, approves vocab month / reading sets / listening queue / writing pool
Week 1+: Students with placement complete → self-study active + pushes (except writing)
Students without placement → reminder only until test complete
```

---

## Implementation phases (indicative)

| Phase | Scope | Platform |
|-------|--------|----------|
| **SS-0** | Placement server, student settings, manager push flags, daily-channel API, hub UI | Web |
| **SS-V1** | Vocabulary Channel A/B, weekly calendar, manual review (方案 A) | Web |
| **SS-R1** | Reading dual channel, IELTS schema, paraphrase, daily passage | Web |
| **SS-L1** | Listening Part 3/4, Tencent TTS, note-taking, self-notes V1 | Web |
| **SS-L2** | Student notes vs AI exemplar comparison | Web |
| **SS-W1** | Writing genres, pre-writing coach, IELTS rubric, revisions | Web |
| **SS-Sp1–Sp4** | Speaking simulator: TTS, record, timers, STT, rubric feedback | Web |
| **SS-App** | Push scheduler, 2h vocab, Streak notifications, local timezone | App / 小程序 |
| **SS-Teacher** | Teacher message push (optional shared notification layer) | Web inbox → App |

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
| 2026-06 | Web-first / App deferred; vocab Web review = 方案 A (manual) |
