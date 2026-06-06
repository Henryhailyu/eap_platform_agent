# Self-Study — Listening module

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

AI-generated **IELTS Academic Listening Part 3 & Part 4** with **playable audio** (TTS), questions, **note-taking coach**, and per-question feedback.

**Source:** **AI only** (Channel B). No manager upload channel.

**Levelling:** none after placement.

---

## Daily rhythm

Alternating from term start:

| Day 1, 3, 5… | **Part 3** — academic discussion (2–4 speakers), 10 questions |
| Day 2, 4, 6… | **Part 4** — academic lecture (1 speaker), 10 questions |

- **19:00** App reminder (local time)  
- **Streak**; no forced catch-up  
- **Practice mode:** audio **replay allowed**  
- **Mock mode (optional):** listen once  
- Holidays: stop push; holiday review mode  

**Web:** listen, answer, notes, coaching; no 19:00 push.

---

## IELTS Part 3 / Part 4 spec (AI default prompt)

### Part 3 — Discussion

| Attribute | Spec |
|-----------|------|
| Context | Education/training (assignment discussion, tutor + students, etc.) |
| Speakers | 2–4 |
| Focus | Opinions, agreement/disagreement, decisions |
| Questions | 10, **in recording order** |
| Preferred types | `LM` `LMC` `LSeC` `LSAQ` |
| Target audio | ~5–8 min |

### Part 4 — Lecture

| Attribute | Spec |
|-----------|------|
| Context | University-style monologue |
| Speakers | 1 |
| Topic | General academic; no prior knowledge |
| Questions | 10, in order |
| Preferred types | `LNC` `LTC` `LSC` `LSeC` `LPL` `LMC` |
| Target audio | ~6–9 min |

### Question type IDs

`LMC` `LM` `LPL` `LFC` `LNC` `LTC` `LFCc` `LSC` `LSeC` `LSAQ`

### Global rules

- Word limits strict; answers **verbatim** from script  
- Accents rotatable (UK/US/AU/NZ) via TTS voices  
- Orders of answers follow script order  

---

## TTS pipeline (implementation)

```
AI script (multi-speaker Part 3 / single Part 4)
  → Tencent Cloud TTS (multi VoiceId Part 3)
  → store audio (COS + CDN)
  → student player
```

**Purchase Tencent products when SS-L1 development starts** (notify coordinator).

---

## Note-taking coach

### Unified note-taking system (Manager)

- One **school-wide** table: symbols, abbreviations, simple Chinese characters + usage rules  
- Uploaded file drives AI note generation prompt  

### AI prompt (seed)

Learn the system; produce **concise** notes from transcript:

- Use symbols only when shorter than full words  
- Do not duplicate symbol + abbreviation for same term  
- **Language:** English abbreviations为主 + 少量中文简字  
- **Part 3:** separate lines by **speaker** for opinions (Matching prep)  
- Output: `exemplar_notes` + `coaching_tips[]` + `key_points[]`  
- Exemplar is **not perfect** — tips should flag redundancy (e.g. avoid `H! All. Welc →`)

**Reference UAT transcript:** urban design / Peter Calthorpe / sustainable communities (see product session examples).

### Student flow

1. Play audio (replay in practice)  
2. **Text box: self-notes (V1 required)**  
3. Answer 10 questions → AI score + explanations  
4. Show exemplar notes + coaching  
5. **V2:** side-by-side compare self-notes vs exemplar  

Notes panel after submit in practice; after listen-only in mock.

---

## Manager workflow

```
Maintain note-taking system file
  → AI generates Part 3/4 (script + questions + draft exemplar notes)
  → TTS audio
  → Manager review / export
  → Manager push only
```

---

## Entities (conceptual)

`ListeningItem` · `ListeningScript` · `ListeningAudio` · `ListeningNoteSystem` · `StudentListeningAttempt` · `StudentSelfNotes`

---

## UAT

- Part 3 multi-voice playback  
- Part 4 note completion marking  
- Self-notes saved; exemplar matches symbol table  
- 19:00 reminder; streak on complete; replay works
