# EAP047 联合彩排清单（Pilot rehearsal）

**Purpose:** One full teacher → student run before real-class pilot or starting **LP-M4**.  
**Class:** `EAP047` · **Skill:** Writing  
**Accounts (pilot default):** `teacher1` / `student1` / `manager1` — password `123456` (rotate before public pilot)  
**Updated:** 2026-06-09 (§8 Self-Study addendum)  

**Related:** [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md) · [`CHECKLIST_AI_HOMEWORK_REPORT.md`](CHECKLIST_AI_HOMEWORK_REPORT.md) · [`I0_PHONE_PILOT.md`](I0_PHONE_PILOT.md)

---

## 0 — Before you start

| # | Check | Pass |
|---|--------|------|
| 0.1 | Server has latest `main` (Self-Study SS-L2 + Sp4 audio + Phase N VOD): `git pull` + `docker compose up -d` on Lighthouse | ☐ |
| 0.2 | Hard refresh teacher/student pages after deploy (`Ctrl+Shift+R` / 清空缓存) | ☐ |
| 0.3 | `.env`: `EAP_AI_ENABLED=1` and AI keys set if testing lesson prep + AI homework | ☐ |
| 0.4 | Optional API smoke: `python backend/scripts/verify_pilot.py --base http://YOUR_HOST:5051 --password '123456'` | ☐ |
| 0.5 | Demo data (optional): `cd backend && python3 scripts/seed_internal_demo.py` | ☐ |

**URLs (adjust host):**

| Role | Page |
|------|------|
| Teacher calendar | `/ui/teacher.html` |
| Lesson prep (LP) | `/ui/teacher-lesson-ai.html?class=EAP047` |
| Live teaching | `/ui/teacher-live.html?class=EAP047` |
| Student calendar | `/ui/student.html` |
| Student live | `/ui/student-live.html?code=XXXXXX` (code from teacher Live banner) |
| Self-Study Centre | `/ui/student-self-study-module.html` |
| Recorded lessons (teacher) | `/ui/teacher-recorded.html?class_name=EAP047` |

---

## 1 — Lesson prep → publish（备课 → 日历）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 1.1 | Teacher | Open **AI Lesson Builder** / lesson prep for **EAP047** | ☐ | |
| 1.2 | Teacher | Upload source (TXT/PDF/DOCX/PPT) or use existing pack → generate **plan** | ☐ | AI off → note error in § Failures |
| 1.3 | Teacher | Generate **HTML** → **Preview** loads in iframe (no raw AI preamble) | ☐ | |
| 1.4 | Teacher | **Publish** to calendar (pick date, title EN + 中文 optional) | ☐ | Confirm success toast / task id |
| 1.5 | Teacher | On **teacher calendar**, open that date → task visible for **EAP047** | ☐ | |

---

## 2 — Student teaching page（学生教学页 · Phase A）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 2.1 | Student | Login `student1` → calendar **EAP047** → same date as §1 | ☐ | |
| 2.2 | Student | Task shows link **Open lesson page** / 打开课时页面 | ☐ | |
| 2.3 | Student | Page loads HTML; in-page activities work (buttons / blanks) | ☐ | |
| 2.4 | Student | Toggle **中文** on student UI | ☐ | |

---

## 3 — Live Teaching（课堂 Live）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 3.1 | Teacher | Open **Live Teaching** → confirm **session code** banner visible | ☐ | If missing, wait for session create or refresh |
| 3.2 | Teacher | **Display library** or **HTML lesson** → push slides/PDF/HTML to class | ☐ | Status: pushed OK |
| 3.3 | Student | Open `student-live.html` with code → see same display (PDF/HTML/slides) | ☐ | |
| 3.4 | Teacher | **Timer** tool → set e.g. 1:00 → **推送给学生** / Push timer to students | ☐ | Top status: pushed OK |
| 3.5 | Student | Live page shows **synced timer** (not “waiting for teacher” only) | ☐ | |
| 3.6 | Teacher | Let countdown reach **0** (or push final state) | ☐ | |
| 3.7 | Student | Hear **~3s bell** + “时间到！” / Time's up | ☐ | Browser may need one click for audio |
| 3.8 | Teacher | Optional: **Poll/Quiz** → Launch to students → student answers | ☐ | |
| 3.9 | Teacher | Optional: **Class activity** game → student UI matches | ☐ | |

---

## 4 — Homework task + submit（作业）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 4.1 | Teacher | **Create New Task** — type **Homework** or **Writing**, class **EAP047** | ☐ | |
| 4.2 | Teacher | Enable **AI marking** + upload **marking descriptor** file (or rely on manager profile) | ☐ | See [`CHECKLIST_AI_HOMEWORK_REPORT.md`](CHECKLIST_AI_HOMEWORK_REPORT.md) |
| 4.3 | Student | Open task → submit text/file homework | ☐ | |
| 4.4 | Teacher | **View submissions** → submission listed | ☐ | |

---

## 5 — AI report → feedback（AI 报告审阅）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 5.1 | Teacher | Open submission → **Generate / refresh AI report** (not NOT FOUND / 500) | ☐ | |
| 5.2 | Teacher | Report body visible → **Approve** → feedback saved | ☐ | |
| 5.3 | Student | Refresh task → sees **teacher feedback** (not empty on 2nd homework) | ☐ | |
| 5.4 | Manager | Optional: **Homework AI marking** profile for EAP047 Writing | ☐ | |

---

## 6 — Phone spot-check（手机抽测）

| Step | Who | Action | Pass | Notes |
|------|-----|--------|------|-------|
| 6.1 | Student phone | Calendar + open teaching page | ☐ | [`I0_PHONE_PILOT.md`](I0_PHONE_PILOT.md) |
| 6.2 | Student phone | Join live with code; timer visible after teacher push | ☐ | |

---

## 7 — AI Self-Study Centre（推荐 · Web Phase 1）

**Detail:** [`CHECKLIST_EAP047_SELF_STUDY.md`](CHECKLIST_EAP047_SELF_STUDY.md)

| Step | Who | Action | Pass |
|------|-----|--------|------|
| 7.1 | Student | Hub → **Self-Study** → Vocabulary + Reading complete one flow each | ☐ |
| 7.2 | Student | **Listening** → notes → practice → **Notes coach** (coverage checklist) | ☐ |
| 7.3 | Student | **Writing** → draft + rubric feedback | ☐ |
| 7.4 | Student | **Speaking** → timer + response; optional record if `EAP_ASR_ENABLED=1` | ☐ |
| 7.5 | Teacher | Optional: **Recorded lessons** upload + publish → student plays | ☐ |

Skip §7 if pilot scope excludes self-study; mark N/A in sign-off.

---

## 8 — Sign-off

| Criterion | Done |
|-----------|------|
| All §1–§5 critical steps ☐ (§3.4–3.7 timer required if Live is in scope) | ☐ |
| §6 phone spot-check | ☐ |
| §7 self-study (if in scope) or N/A | ☐ |
| No blocker logged in § Failures | ☐ |
| Ready for **1–2 real classes** (2–4 weeks) per [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md) | ☐ |

**Prior sign-off (2026-06-04):** §1–§6 completed for Live + homework path. Re-run §0 + §7 after Self-Study / audio deploy.

---

## Failures (log during rehearsal)

| Step | What happened | Screenshot / HTTP code | Owner |
|------|---------------|------------------------|-------|
| | | | |

---

## Quick troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Student live still “waiting for teacher” with timer pushed | Hard refresh student; confirm teacher **推送给学生** success; student joined **same code** |
| Timer push fails | Start Live session first (code banner); teacher logged in; `git pull` + rebuild |
| AI report NOT FOUND | Deploy `homework_marking` fixes; see [`CHECKLIST_AI_HOMEWORK_REPORT.md`](CHECKLIST_AI_HOMEWORK_REPORT.md) |
| No lesson link on student task | Republish from lesson prep; check task date/class **EAP047** |
| No bell at 0 | Student page in focus; unmute device; one tap on page (browser audio policy) |
| Listening no TTS player | Check `EAP_TTS_ENABLED=1` + COS; `/api/student/self-study/audio/status` |
| Speaking mic blocked | Use HTTPS (`HTTPS_AFTER_ICP.md`); browser permission |
| Notes coach 403 | Complete listening **practice** first |

---

*Mark Pass ☐ as you go. When §8 is done, update `EAP_PROJECT_TRACKER.md` changelog.*
