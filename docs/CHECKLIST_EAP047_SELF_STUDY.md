# EAP047 — Self-Study Centre rehearsal (addendum)

**Use with:** [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md) §8  
**Class:** `EAP047` · **Account:** `student1` / `manager1`  
**Lighthouse example:** `http://124.222.124.42:5051` (HTTPS after ICP)

---

## 0 — Preflight

| # | Check | Pass |
|---|--------|------|
| 0.1 | Latest `main` deployed (`git pull` + `docker compose up -d`) | ☐ |
| 0.2 | Optional audio: `.env` has `EAP_AUDIO_ENABLED=1` + Tencent keys | ☐ |
| 0.3 | `GET /api/student/self-study/audio/status` → `tts` true (if keys on) | ☐ |

**Entry:** `/ui/student-self-study-module.html` or student hub → **AI Self-Study Centre**

---

## 1 — Vocabulary (SS-V1)

| Step | Action | Pass |
|------|--------|------|
| 1.1 | Open **Vocabulary** → Channel B today’s cards load | ☐ |
| 1.2 | Complete practice flow → progress updates | ☐ |
| 1.3 | `manager1` → enable Channel A for EAP047 → student sees school pack tab | ☐ |

---

## 2 — Reading (SS-R1)

| Step | Action | Pass |
|------|--------|------|
| 2.1 | **Reading** → today’s passage + questions | ☐ |
| 2.2 | Submit answers → auto-mark + evidence | ☐ |

---

## 3 — Listening (SS-L1 + SS-L2)

| Step | Action | Pass |
|------|--------|------|
| 3.1 | **Listening** → script + notes textarea | ☐ |
| 3.2 | If TTS on: audio player plays (or “generating” then refresh) | ☐ |
| 3.3 | Save notes → practice questions → submit | ☐ |
| 3.4 | **Notes coach** → coverage % + key-point checklist + exemplar side-by-side | ☐ |

---

## 4 — Writing (SS-W1)

| Step | Action | Pass |
|------|--------|------|
| 4.1 | **Writing** → genre task + pre-coach | ☐ |
| 4.2 | Draft + submit → rubric feedback (FC/TR/LR/GRA) | ☐ |

---

## 5 — Speaking (SS-Sp1–Sp4)

| Step | Action | Pass |
|------|--------|------|
| 5.1 | **Speaking** → Part 1 session → timer → typed response → feedback | ☐ |
| 5.2 | If TTS on: play question audio | ☐ |
| 5.3 | If ASR on: record answer → submit → transcript appears | ☐ |
| 5.4 | Optional: P2 cue card / full mock from session list | ☐ |

---

## 6 — Recorded lessons (Phase N, optional)

| Step | Action | Pass |
|------|--------|------|
| 6.1 | `teacher1` → **Recorded lessons** → upload MP4 (local or VOD if enabled) | ☐ |
| 6.2 | Publish → `student1` → recorded viewer → play | ☐ |

---

## Failures

| Step | What happened | Owner |
|------|---------------|-------|
| | | |

---

*TTS/录音需 HTTPS 时见 [`HTTPS_AFTER_ICP.md`](HTTPS_AFTER_ICP.md).*
