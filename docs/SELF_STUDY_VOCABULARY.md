# Self-Study — Vocabulary module

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

Help students learn academic vocabulary efficiently with AI: **记** (acquire) via affix-first method + mnemonics; **忆** (retain) via spaced review. Target: more words in less time, long-term recall.

---

## Student UI

Two panels:

1. **教务资料 (Channel A)** — multiple manager packs; student chooses pack; **free progress**
2. **自主学习 (Channel B)** — AI-approved monthly course; **30 words/day** calendar

**Daily channel:** `A` if manager pushed vocab for class, else `B` (see parent doc).

---

## Channel A — Manager uploads

| Field | Notes |
|-------|--------|
| `display_name` | Required, e.g. *Merriam-Webster Vocabulary Builder 词汇学习* |
| Files | PDF, Word, Excel, etc. |
| Structure | By **chapter / unit** |
| Scope | Class or global |
| Progress | Student-driven, no daily word cap |

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

`VocabularyMaterialPack` · `VocabularyCourse` · `VocabularyWord` · `StudentVocabularyProgress` · `StudentWordHistory` (dedup)

---

## UAT hints

- Manager push EAP047 list → student sees Channel A daily  
- No push → Channel B 30 words at 19:00 (App)  
- Friday no new words; weekend review window  
- Export CSV analytics (Manager HM-M4 is homework marking — separate)
