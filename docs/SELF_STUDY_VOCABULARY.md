# Self-Study — Vocabulary module

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

Help students learn academic vocabulary efficiently with AI: **记** (acquire) via affix-first method + mnemonics; **忆** (retain) via spaced review. Target: more words in less time, long-term recall.

---

## Student UI

Two channels:

1. **教务资料 (Channel A)** — manager-uploaded word list; **30 words/day** (same cadence as Channel B)
2. **自主学习 (Channel B)** — AI-approved monthly course; **30 words/day** calendar

**Daily channel:** `A` if manager pushed vocab for class, else `B` (see parent doc).

---

## Channel A — Manager uploads (updated Jun 2026)

| Field | Notes |
|-------|--------|
| `display_name` | Required, e.g. *Merriam-Webster Vocabulary Builder 词汇学习* |
| Files | PDF, Word, Excel, TXT — one or more per pack |
| AI parse | Upload → AI/rule parse → flat ordered word bank per pack |
| Scope | Class or global (latest pack for class wins on push) |
| Student delivery | **30 words per new-word day**, same week pattern as Channel B |
| Overflow | Words beyond the daily 30 on a given day are **not** pushed that day; they roll to later new-word days |
| Completion | When a new-word day has **fewer than 30** words remaining in the pack, deliver the remainder and **Channel A stops** (push auto-disabled for the class) |
| Modify | Manager **Modify** replaces the pack word bank and resets Channel A delivery for that class |

### Channel A vs old “free pack” model

Previously Channel A used student-chosen packs/units with free progress. **Current behaviour:** once Channel A is enabled, students see **today’s 30 words** (learn · practice · games) like Channel B — not a pack browser.

---

## Channel B — AI academic word course

| Rule | Value |
|------|--------|
| Volume | **30 words/day × ~30 days ≈ 900 words / cycle** |
| Dedup | **No repeat** for same student across terms/courses (global student history) |
| Class | **One approved list per class** — all students share it |
| Review | Manager: Excel download → edit → re-upload → **Manager push only** |
| AI draft | Manager prompt → generate month → export Word/Excel for review |

### Pedagogy — 记

1. **Affix (宪法):** prefix + root + suffix → core meaning → contextual meaning  
   Example: *precursor* → pre + cur + -or → “one who runs ahead”
2. **Mnemonic (when affix weak):** image-style hooks for hard words (e.g. *chrysanthemum* for Chinese learners)
3. AI per word: `method_primary: affix | mnemonic | mixed` + structured fields (phonetic, examples, etc.)

### Pedagogy — 忆 (App / mini-program only)

**Week pattern** (example: week starting Sun 7 Jun 2026 19:00):

| Day | 19:00 | Daytime (07:00–22:00) |
|-----|-------|------------------------|
| Sun | 30 **new** words + practice | — |
| Mon–Thu | 30 **new** + practice | Every **2h**: 5-min review of **previous day’s** 30 words |
| Fri | **No new words** | Review only |
| Fri 19:00 – Sun 07:00 | — | Review **Sun–Thu** new words (2h cycles) |
| Sun 19:00 | New week starts | — |

- **Quiet:** 22:00 – 07:00 (local time) — no push  
- **UI:** review **calendar** so students see plan  
- **Web:** full 30-word + practice; **no** 2h push  

### Daily practice (new-word session)

1. Affix drill  
2. Academic gap-fill (distractors: same root family)  
3. Guessing from core meaning + context  
4. Mnemonic items (light gamification)  

**2h review:** flashcards (know / fuzzy / forget) + occasional single question.

### Placement interaction

- Complete placement → self-study on  
- Total **&lt; 40%** → entry-level **teaching** (scaffolding), **same word list**  

### Unsubscribe

Stop all vocab pushes; optional manual review on Web.

---

## Entities (conceptual)

`VocabularyMaterialPack` · `VocabularyPackWord` · `VocabularyChannelAState` · `VocabularyCourse` · `VocabularyWord` · `StudentVocabularyProgress` · `StudentWordHistory` (dedup)

---

## UAT hints

- Manager upload AWL PDF → enable Channel A for EAP047 → student sees 30 words/day (learn + practice + games)  
- Pack with 65 words → days 1–2: 30 each, day 3: 5 words → Channel A completes  
- Modify pack with new file → word bank and filename update; delivery resets  
- No push → Channel B 30 words at 19:00 (App)  
- Friday no new words; weekend review window  
- Export CSV analytics (Manager HM-M4 is homework marking — separate)
