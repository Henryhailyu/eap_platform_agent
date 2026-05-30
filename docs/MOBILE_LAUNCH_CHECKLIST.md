# Mobile launch checklist (WeChat + native apps)

**Strategy:** Web-first — students can use **mobile browser** on the pilot URL today. WeChat and native apps come **after** web pilot is stable.  

**Last updated:** 2026-05-26  

---

## Path overview

| Path | Effort | Status | Best for |
|------|--------|--------|----------|
| **A. Mobile web** (`/ui/` on phone) | Low | ✅ Ready | Fastest; teachers + students |
| **B. WeChat mini-program** | Medium | ⏸ Code ready; blocked on 备案/认证 | China schools in WeChat daily |
| **C. Native apps** (iOS / Android / HarmonyOS) | High | ⬜ Not started | Long-term App Store presence |

---

## Path A — Mobile web (use now) ✅

No extra deploy beyond web checklist.

- [x] Responsive layout (`css/mobile.css`, Phase H)  
- [x] Touch targets, mobile calendar, student live wider layout  
- [ ] **You test:** open https://eap-platform-pilot.onrender.com/ui/student-live.html on phone  
- [ ] **You test:** student calendar + submit on phone (`docs/I0_PHONE_PILOT.md`)  

**Not in mobile web yet:** full parity with desktop Live tools; acceptable for student daily loop.

---

## Path B — WeChat mini-program ⏸ ON HOLD

**Resume when:** 备案 + 微信企业认证 approved.  
**Full guide:** [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md)  
**AppID (configured):** `wx1b1247067a43152` · **EAP学习助手**

### Already built ✅

- [x] Bearer token API (`/api/v1/auth/login`, student routes) — I2a–I2e  
- [x] API doc — `docs/API_STUDENT_MINI.md`  
- [x] Mini-program MVP — `wechat-mini/` (login, calendar, day, task, archive)  
- [x] Production API host in `wechat-mini/config.js` → `eap-platform-pilot.onrender.com`  

### Not in mini-program MVP (defer to v2)

- Live Teaching / join live class  
- Display library / classroom display  
- AI Self-Study Centre  
- Teacher / manager admin  

### Go-live steps (when unblocked)

**Prerequisites**

- [ ] Web pilot stable 2–4 weeks (`WEB_LAUNCH_CHECKLIST.md`)  
- [ ] Render passwords rotated  
- [ ] 备案 + 微信认证 complete  

**WeChat admin**

- [ ] Whitelist domains: `eap-platform-pilot.onrender.com` (request / upload / download)  
- [ ] `wechat-mini/config.js` → `USE_LOCAL_DEV = false`  
- [ ] Upload build in 微信开发者工具  
- [ ] Publish **体验版** → add 体验成员  
- [ ] Real-phone test: login → calendar → task → submit → 中文 toggle  

**Review & release**

- [ ] Privacy policy URL (I5)  
- [ ] Submit **审核** (category: 教育)  
- [ ] **发布** formal version  

**Notifications (optional v1.1 — I4)**

- [ ] One subscribe template: “Teacher posted feedback”  
- [ ] Backend notification queue  

**Est. timeline after unblock:** 2–4 weeks dev/test + WeChat review time  

---

## Path C — Native apps (Phase M) ⬜

**Start when:** Web API subset is stable and documented.

### Prerequisites

- [ ] Web formal pilot running (`WEB_LAUNCH_CHECKLIST.md` complete)  
- [ ] Freeze API surface — extend `API_STUDENT_MINI.md` + teacher routes; optional OpenAPI  
- [ ] Bearer auth proven on all client routes  
- [ ] Privacy / App Store compliance plan  

### Suggested order

1. [ ] Choose first platform: **iOS** or **Android** (one store first)  
2. [ ] Student MVP shell: login → calendar → task → submit → archive (same as WeChat scope)  
3. [ ] TestFlight / internal testing track  
4. [ ] Second platform or HarmonyOS (华为开发者) if needed for China market  

### Platforms

| Platform | Tooling | Store |
|----------|---------|-------|
| iOS | Xcode (Swift/SwiftUI) | App Store |
| Android | Kotlin / Android Studio | Google Play |
| HarmonyOS | 华为开发者 / ArkTS | 华为应用市场 |

**Est. timeline after web stable:** 4–6 months focused for first native MVP  

---

## What students use when (summary)

| Stage | Student mobile experience |
|-------|---------------------------|
| **Now** | Phone browser → pilot URL |
| **After WeChat go-live** | WeChat mini-program (daily tasks) + browser for Live if needed |
| **After native apps** | App Store / 华为 + WeChat optional |

Teachers stay on **laptop web** for Live Teaching, Game Builder, AI Lesson Builder.

---

## Quick links

| Doc | Purpose |
|-----|---------|
| [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md) | Web pilot first |
| [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md) | WeChat step-by-step |
| [`API_STUDENT_MINI.md`](API_STUDENT_MINI.md) | Mini-program API |
| [`WEB_FIRST_ROADMAP.md`](WEB_FIRST_ROADMAP.md) | Strategy |

---

*Tracker changelog:* `EAP_PROJECT_TRACKER.md` in the Cursor agent window workspace.
