# SS-Sp2 / SS-Sp3 — Self-study speaking (Part 2/3 + full mock + history)

**Parent:** [`SELF_STUDY_SPEAKING.md`](SELF_STUDY_SPEAKING.md) · [`SS-Sp1_SELF_STUDY_SPEAKING.md`](SS-Sp1_SELF_STUDY_SPEAKING.md)

## SS-Sp2 — Part 2 & Part 3

### Backend

- **P2 session** — cue card JSON: 60s prep + 120s long turn, min 80 words
- **P3 session** — 4 questions × 90s, min 40 words
- `_session_items()` normalises P1 questions, P2 cue card, P3 questions, MOCK steps
- `_build_feedback()` part-aware thresholds (P2 long-turn, P3 abstract lexis)
- `seed_extended_speaking_sessions()` adds P2/P3 seeds on existing DBs

### Frontend

- Cue card UI (IELTS-style bullets)
- Prep phase: 60s countdown + optional notes → long turn
- P3 timer: 90s per question
- Hub lists sessions with **P1 / P2 / P3 / Full mock** badges

## SS-Sp3 — Full mock + history

### Backend

- **MOCK session** — shortened P1 (2) → P2 (1) → P3 (2) flow in one sitting
- `GET /api/student/self-study/speaking/history` — last 50 responses + recent band average

### Frontend

- **History** tab — band trend + recent submissions
- Mock session runs mixed steps using per-item `partType`

## Deferred (SS-Sp4)

- Tencent **SOE** pronunciation scoring (PR criterion enrichment)
- TTS question playback · browser recording · ASR transcript
- Full-length mock (4–6 P1, 4–6 P3) · audio replay · weak-topic vocab links

## UAT

1. `student1` → Speaking → **Part 2** → prep 60s → long turn 120s → feedback  
2. **Part 3** → 90s questions  
3. **Full mock** → complete all 5 steps in sequence  
4. **History** tab shows band trend after submissions  

## Next

**SS-Sp4** delivered — [`SS-Sp4_SELF_STUDY_SPEAKING_AUDIO.md`](SS-Sp4_SELF_STUDY_SPEAKING_AUDIO.md). Extend mock to full 11–14 min flow; CDN audio domain after ICP.  
**Procurement:** [`SS-Sp4_TENCENT_PROCUREMENT_CHECKLIST.md`](SS-Sp4_TENCENT_PROCUREMENT_CHECKLIST.md)
