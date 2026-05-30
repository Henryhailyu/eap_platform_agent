# Web launch checklist (Render pilot → real-class use)

**Pilot URL:** https://eap-platform-pilot.onrender.com  
**Repo:** `Henryhailyu/eap_platform_agent` · branch `main`  
**Last updated:** 2026-05-26  

Use this list to move from **“demo works”** to **“real classes can use the website reliably.”**

---

## Already done ✅

| Area | Status |
|------|--------|
| Core web (E–H): login, calendar, tasks, submit, feedback, manager admin | ✅ |
| Bilingual UI + mobile-friendly `/ui/` | ✅ |
| Render deploy (Docker, persistent `/data`, auto-deploy from `main`) | ✅ |
| Student AI Self-Study Centre (S1–S8) + server materials (K1) | ✅ |
| AI coaches vocabulary/reading/writing/listening/speaking (K2) | ✅ code; needs API keys on Render |
| Teacher Live + 14 games + Game Builder (L) | ✅ |
| AI HTML lessons + publish (K3–K5) | ✅ |
| Live classroom display + Display library (K6/K6d) | ✅ |
| Inline preview: PDF, TXT, DOCX (mammoth), PPT→PDF (LibreOffice) | ✅ local + Docker (`bd5a81e`) |
| Git commits | `ec12a96` (K6d), `bd5a81e` (LibreOffice in Docker) |

---

## Before real-class pilot — do these first

### Ops & security (high)

- [ ] **Confirm Render deploy Live** — latest commit `bd5a81e` (or newer) shows **Deployed** in dashboard  
- [ ] **Rotate passwords** — run `seed_pilot.py` on Render Shell with strong `EAP_PILOT_DEFAULT_PASSWORD` (not `123456`)  
- [ ] **Configure AI keys on Render** — `EAP_DEEPSEEK_API_KEY` and/or OpenAI vars in Environment (see `docs/API_KEYS_AND_SECRETS.md`)  
- [ ] **Backup plan** — weekly copy of `/data/eap_platform.db` + `/data/uploads` (see `docs/RENDER_OPS.md`)  
- [ ] **Optional:** set `EAP_PUBLIC_URL=https://eap-platform-pilot.onrender.com` for pinned CORS  

### QA — full teacher → student path (high)

Run on **HTTPS pilot** (not only localhost):

- [ ] Manager: login `manager1` → calendar / classes / AI template settings  
- [ ] Teacher: login `teacher1` → create task → upload material → feedback on submission  
- [ ] Teacher: **Live Teaching** → launch session → student join code works  
- [ ] Teacher: **Display library** → upload PDF, DOCX, **PPT** → inline preview + download  
- [ ] Teacher: **AI Lesson Builder** → generate HTML → preview (no AI preamble) → push to classroom  
- [ ] Student: login `student1` → calendar → submit homework  
- [ ] Student: **Join live class** → see display (HTML/PDF/PPT) + answer activities  
- [ ] Student: **AI Self-Study Centre** → module + Ask AI (after keys configured)  
- [ ] Phone browser: student calendar + live join (`docs/I0_PHONE_PILOT.md`)  

### Known limitations (accept or fix)

- [ ] Render **cold start** — first visit after ~15 min idle may 502 for ~60 s (`pilot-wake.js` helps)  
- [ ] **SQLite** on single instance — OK for pilot; plan PostgreSQL if traffic grows  
- [ ] First **PPT conversion** on server may take 10–30 s  
- [ ] AI disabled on pilot until env keys set (`/api/health` → `ai.enabled`)  

---

## “Web formal pilot” definition (done when)

1. Passwords rotated; backups documented and tested once  
2. AI keys configured (if AI features are in scope for pilot)  
3. One **full-chain rehearsal** completed with checklist above — all boxes ticked  
4. **1–2 real classes** use the site for **2–4 weeks**; critical bugs fixed  
5. Teacher handout / quick-start doc shared (`docs/PILOT_HANDOUT.md`)  

---

## Optional polish (after pilot starts)

- [ ] Custom domain + HTTPS cert on Render  
- [ ] PostgreSQL migration  
- [ ] Error monitoring / uptime alerts  
- [ ] Privacy policy page (needed before wider rollout)  
- [ ] L32+ richer game interactions beyond MCQ  

---

## Quick links

| Doc | Purpose |
|-----|---------|
| [`RENDER_OPS.md`](RENDER_OPS.md) | Cold start, passwords, backups |
| [`PILOT_DEPLOY.md`](PILOT_DEPLOY.md) | Deploy steps |
| [`I0_PHONE_PILOT.md`](I0_PHONE_PILOT.md) | Phone testing |
| [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md) | AI keys |
| [`MOBILE_LAUNCH_CHECKLIST.md`](MOBILE_LAUNCH_CHECKLIST.md) | WeChat + native apps |

---

*Tracker changelog:* `EAP_PROJECT_TRACKER.md` in the Cursor agent window workspace.
