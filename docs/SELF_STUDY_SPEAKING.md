# Self-Study — Speaking module (IELTS simulator)

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

**IELTS Speaking simulator:** AI sets questions, **plays them by voice**, student **records spoken answers** under **strict timers**, then receives **band-style scores** on the four IELTS Speaking criteria plus actionable advice.

**Source:** AI-generated sessions (Channel B).  
**Push / Streak:** **none** — student enters **autonomously** (same policy as writing).  
**Placement:** speaking **not assessed** in placement mock; self-study speaking **not tiered** by placement score.

---

## IELTS Speaking format (reference)

Official: [IELTS Speaking format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking) — **11–14 minutes**, **3 parts**, Academic = General Training.

| Part | Official | Simulator focus |
|------|----------|-----------------|
| **Part 1** | Introduction & familiar topics (4–5 min, several questions) | AI asks short questions (work, study, hobbies, etc.) |
| **Part 2** | Cue card + **1 min prep** + **2 min** long turn | Task card on screen + prep timer + 2 min recording |
| **Part 3** | Two-way discussion linked to Part 2 topic (4–5 min) | Deeper / abstract follow-up questions |

---

## Response time limits (product — locked)

Hard stop when timer ends — **cannot continue** that response.

| Part | Limit | Notes |
|------|-------|--------|
| **Part 1** | **≤ 60 s** per question | One question → one answer window |
| **Part 2** | **120 s** long turn | See prep below |
| **Part 3** | **≤ 90 s** per question | Per question |

### Part 2 preparation (recommended — official IELTS)

- **60 s preparation** after cue card shown (notes field optional)  
- Then **120 s** recording only for the long turn  
- Product may add **+30 s** rounding questions after Part 2 (optional phase 2)

---

## Student modes

### A. Part practice

Student picks **Part 1**, **Part 2**, or **Part 3** and runs one or more items.

### B. Full mock (recommended)

Sequential **Part 1 → Part 2 → Part 3** (~11–14 min flow), single session report at end.

---

## Session flow (technical)

```
AI generates SpeakingSession (part, questions, part2_cue_card?)
  → TTS plays examiner question(s)  // Tencent TTS
  → UI countdown visible
  → Student records audio (browser / App)
  → On stop OR timeout → lock answer (no extension)
  → STT transcript (Tencent ASR / SOE) + audio stored
  → AI scores vs IELTS public band descriptors
  → Feedback panel per criterion + overall band (practice estimate)
```

**Timeout behaviour:** recording **stops**; submit whatever was captured; flag `timed_out: true` in feedback.

---

## AI question generation (default prompt seed)

- Part 1: 4–6 familiar-topic questions  
- Part 2: cue card with topic + 3–4 bullet prompts + “explain one aspect”  
- Part 3: 4–6 questions escalating from concrete to abstract, linked to Part 2 topic  
- Topics: EAP-appropriate; class config (EAP047 / EAP039) adjusts abstractness, not per-student placement  
- **Original content only** — do not copy real IELTS items  

---

## Marking — IELTS four criteria (equal weight)

| ID | Criterion |
|----|-----------|
| `FC` | Fluency and Coherence |
| `LR` | Lexical Resource |
| `GRA` | Grammatical Range and Accuracy |
| `PR` | Pronunciation |

**Output:**

```
overall_band_estimate  // average of 4, round to 0.5 per IELTS rules; practice disclaimer
criteria[]: { id, band, strengths[], improvements[] }
per_question_notes[]  // optional
actionable_next_steps[]
sample_upgrade_phrases[]  // band+1 phrasing examples
```

Reference: IELTS Speaking public band descriptors & key assessment criteria (ielts.org).

**Pronunciation note:** Without dedicated pronunciation API, phase 1 may use **ASR confidence + prosody proxies + AI** from audio/transcript; phase 2: Tencent **oral evaluation (SOE)** if purchased.

---

## Manager workflow

Align with writing / listening AI-only:

```
Manager class prompt / topic pool
  → AI generates session script
  → [Optional] export review
  → Available to students (no push)
```

Default: **on-demand generation** per session; optional manager **approved topic packs** later.

---

## Platform

| Capability | Web | App / 微信小程序 |
|------------|-----|------------------|
| TTS question play | ✅ | ✅ |
| Microphone record | ✅ (permission) | ✅ |
| Timers + hard stop | ✅ | ✅ |
| Full mock | ✅ | ✅ |
| 19:00 push | ❌ | ❌ |

**Independence:** separate from calendar homework and from placement speaking (“not assessed” in placement mock).

---

## External services (notify before SS-Sp1)

| Service | Use |
|---------|-----|
| Tencent **TTS** | Examiner voice — question playback |
| Tencent **ASR** | Speech-to-text for scoring |
| Tencent **SOE** (optional) | Pronunciation / fluency metrics |
| **COS** | Audio storage |

Same procurement conversation as listening TTS.

---

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **SS-Sp1** | Part 1 single Q: TTS + record + timer + STT + 4-criteria AI feedback |
| **SS-Sp2** | Part 2 cue card + prep + 2 min + Part 3 questions |
| **SS-Sp3** | Full mock + session history + band trend |
| **SS-Sp4** | SOE pronunciation enrichment |

---

## Better ideas (recommended)

1. **Examiner voice persona** — consistent TTS voice across parts in one mock.  
2. **Cue card UI** — visual task card matching real IELTS layout.  
3. **Replay** — student listens to own recording while reading feedback.  
4. **Upgrade samples** — show Band+0.5 rephrases for weak answers (not full replacement).  
5. **Weak-topic tag** — if LR low on “environment”, suggest vocab pack link from vocabulary module.  
6. **TOEFL speaking** — defer; keep IELTS-only unless product asks later.

---

## Open decisions

| # | Question | Default if silent |
|---|----------|-------------------|
| 1 | Part 2 **60 s prep** included? | **Yes** |
| 2 | After timeout, allow **one replay listen** of own answer before feedback? | Yes, no re-record |
| 3 | Minimum Part 1 questions per session | 4 |
| 4 | Save audio on server how long | 90 days |
| 5 | Manager must approve each AI session before student sees? | No — on-demand |

---

## UAT

- Part 1: timer stops at 60 s; no extra speech accepted  
- Part 2: prep 60 s → speak 120 s; bullets on card  
- Part 3: 90 s per question  
- Feedback shows FC/LR/GRA/PR + overall band  
- No push notification when idle
