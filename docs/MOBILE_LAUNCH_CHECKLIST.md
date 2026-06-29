# Mobile launch checklist (WeChat + native apps)

**Strategy:** Web-first — students can use **mobile browser** on the pilot URL today. WeChat and native apps come **after** web pilot is stable.  

**Last updated:** 2026-06-29  

---

## Path overview

| Path | Effort | Status | Best for |
|------|--------|--------|----------|
| **A. Mobile web** (`/ui/` on phone) | Low | ✅ Ready | Fastest; teachers + students |
| **B. WeChat mini-program** | Medium | 🔄 **P4 — 体验版真机** | China schools in WeChat daily |
| **C. Native apps** (iOS / Android / HarmonyOS) | High | ⬜ Not started | Long-term App Store presence |

---

## Path A — Mobile web (use now) ✅

No extra deploy beyond web checklist.

- [x] Responsive layout (`css/mobile.css`, Phase H)  
- [x] Touch targets, mobile calendar, student live wider layout  
- [ ] **You test:** open https://elc-eap-platform.top/ui/student-live.html on phone  
- [ ] **You test:** student calendar + submit on phone (`docs/I0_PHONE_PILOT.md`)  

**Not in mobile web yet:** full parity with desktop Live tools; acceptable for student daily loop.

---

## Path B — WeChat mini-program 🔄 P4 (体验版真机)

**Status:** DevTools 验收通过（含订正）；下一步为公众平台域名 + 上传体验版 + 真机测试。  
**Full guide:** [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md)  
**AppID:** `wx1b12474067a43152` · **EAP伴学助手** · API `elc-eap-platform.top`

### Already built ✅

- [x] Bearer token API (`/api/v1/auth/login`, student routes) — I2a–I2e  
- [x] API doc — `docs/API_STUDENT_MINI.md`  
- [x] Mini-program MVP — `wechat-mini/` (login, calendar, day, task, archive)  
- [x] Production API host in `wechat-mini/config.js` → `elc-eap-platform.top`  
- [x] Revision submit fix (`POST` on `/api/submissions/{id}/revision`) — deployed  
- [x] DevTools smoke: login → calendar → task → submit / revision  

### P4 — your steps now (WeChat admin + phone)

**A. 服务器域名** — https://mp.weixin.qq.com → **开发** → **开发管理** → **开发设置** → **服务器域名**

| 类型 | 域名（不要写 `https://`） |
|------|---------------------------|
| request 合法域名 | `elc-eap-platform.top` |
| uploadFile 合法域名 | `elc-eap-platform.top` |
| downloadFile 合法域名 | `elc-eap-platform.top` |

保存后等待生效（通常几分钟到数小时）。

**B. 上传体验版** — 微信开发者工具

1. 确认 `config.js` → `USE_LOCAL_DEV = false`  
2. **详情 → 本地设置** — 真机前可保持「不校验合法域名」仅用于 Mac 模拟器；**体验版不依赖此项**  
3. **上传** → 版本备注 e.g. `pilot-2026-06-revision`  
4. 公众平台 → **管理** → **版本管理** → 选开发版本 → **选为体验版**  
5. **成员管理** → 添加你的微信号为 **体验成员**

**C. 真机验收**（扫体验版二维码）

| # | 操作 | 通过标准 |
|---|------|----------|
| 1 | 登录 `student1` / 生产密码 | 进入 Calendar |
| 2 | 点有任务的日期 → 打开 Task | 详情与网页一致 |
| 3 | 提交作业（文字或文件） | 成功提示，状态更新 |
| 4 | 有反馈的任务 → Send revision | 不再 405 |
| 5 | 打开教师材料 / 作业文件 | PDF 或 doc 能打开 |
| 6 | Archive、中文切换 | 正常 |

失败时看报错：`request:fail url not in domain list` → 检查域名白名单；401 → 密码与服务器 `.env` 一致。

### Not in mini-program MVP (defer to v2)

- Live Teaching / join live class  
- Display library / classroom display  
- AI Self-Study Centre  
- Teacher / manager admin  

### Go-live steps (after P4 体验版稳定)

**Prerequisites**

- [x] Tencent production API healthy (`/api/health`)  
- [ ] 体验版真机验收通过（上表 C）  
- [ ] 备案 + 微信认证（正式版审核需要）  

**WeChat admin (P4)**

- [ ] Whitelist domains: `elc-eap-platform.top` (request / uploadFile / downloadFile)  
- [x] `wechat-mini/config.js` → `USE_LOCAL_DEV = false`  
- [ ] Upload build in 微信开发者工具  
- [ ] Publish **体验版** → add 体验成员  
- [ ] Real-phone test: login → calendar → task → submit → revision → 中文 toggle  

**Review & release (P5)**

- [x] Privacy policy page — `https://elc-eap-platform.top/ui/privacy.html`  
- [x] Terms page — `https://elc-eap-platform.top/ui/terms.html`  
- [x] Mini-program privacy popup + login legal links (`__usePrivacyCheck__`)  
- [ ] 公众平台 **用户隐私保护指引** 填写并与页面一致  
- [ ] Submit **审核** (category: 教育) with privacy URL above  
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
