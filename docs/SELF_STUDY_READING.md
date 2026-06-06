# Self-Study — Reading module

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

IELTS Academic reading practice with **auto-marking** and **per-question AI explanation** (why correct / why wrong).

**Levelling:** none — same standard for all students in class after placement.

---

## Student UI

1. **学校推送 (Channel A)** — manager-selected materials  
2. **AI 生成 (Channel B)** — approved AI sets  

**Daily channel:** A if manager pushed reading for class, else B.

**Daily target:** **1 passage + all its questions (~13–14)** — not full 40-question mock in one day.

**Channel A sequencing:** when multiple passages pushed, deliver **one per day in manager `sort_order` / unit_no** (not student pick for “today”).

---

## Channel A — Manager upload

### Workflow

```
upload (Word / PDF / image)
  → AI/OCR extract_to_draft
  → manager confirms 「抽取完成」 (required before next step)
  → manager edits text
  → [optional] paraphrase ON
       → AI: 3 styles (A/B/C), keep question TYPE IDs, paraphrase all content
  → save_to_library
  → manager download / review
  → select items → push to class
```

### Paraphrase styles (copyright-safe for past-paper-like sources)

| Style | Intent |
|-------|--------|
| **A** | Same difficulty academic rewrite |
| **B** | Shorter sentences, simpler connectors |
| **C** | Same structure, new examples/data |

- Question **types** unchanged; stems/options paraphrased  
- `source_type`: `licensed_original | paraphrased | ai_original`

---

## Channel B — AI generation

**Format:** IELTS **Academic** (EAP047 & EAP039 both Academic — not GT).

### Passage length

| Passage | Words |
|---------|-------|
| P1 (easier) | 600–900 |
| P2 (medium) | 750–900 |
| P3 (harder) | 800–1000+ |
| 3 passages total | 2000–2750 (~2850 max) |

### Question type IDs

`MC` `TFNG` `YNNG` `MH` `MI` `MF` `MSE` `SC` `SumC` `NTCD` `SAQ` `CL` `SL`

### AI rules

- Strict **word limits** per instruction  
- Answers **verbatim** from passage  
- No contractions in answers; hyphenated = one word  
- TFNG = facts; YNNG = writer claims; NG = neither confirm nor deny  
- P1→P3 difficulty increase; MH extra distractor headings  

**Manager:** generate → export → edit/upload → push.

---

## Student flow

1. Open today’s passage (A or B per routing)  
2. Answer all questions  
3. AI scores + explains each item (passage evidence for correct; error type for wrong)  

### App

- **19:00** reminder (local time)  
- **Streak** on completion; **no forced catch-up**  
- Holidays: no push; holiday review mode  

### Web

Practice + explanations; no 19:00 reminder.

---

## JSON schema (conceptual)

`passage_meta` · `paragraphs[]` · `questions[]{type_id, instruction, stem, options?, answer, word_limit}`

---

## UAT

- OCR draft → confirm → paraphrase 3 variants → push one passage/day in order  
- Channel B daily passage after approve  
- TFNG/SC word-limit marking  
- Streak increments; no nag after missed day
