# EAP platform — product vision (living document)

**Last updated:** 2026-05-21  
**Status:** Pilot web live on Render; WeChat **on hold** until 备案/认证; native apps planned after web.

---

## Release strategy (agreed direction)

| Priority | Channel | Status |
|----------|---------|--------|
| **1** | **Web** (`/ui/` on HTTPS) | **Active** — build features here first |
| **2** | **WeChat mini-program** | **Suspended** until platform authorization |
| **3** | **Native apps** | **Planned** — iOS (Xcode), Android (Google Play), HarmonyOS (华为开发者) |

**Rationale:** One backend (Flask API + SQLite/PostgreSQL later). Ship teaching/learning features on the **website** quickly; reuse the same APIs for WeChat (later) and native shells (later).

---

## Core idea (unchanged)

Calendar-centred hub for **teachers**, **students**, and **managers** — class-based access, tasks, materials, submissions, feedback, progress.

**Live pilot:** https://eap-platform-pilot.onrender.com

---

## Student learning vision (to be detailed by product owner)

**Goal:** Autonomous learning using teacher materials + embedded AI.

**Planned highlights (summary — full spec pending):**

- Teachers upload learning materials (e.g. electronic *Merriam-Webster’s Vocabulary Builder*: PDF, Word, TXT; **EPUB/MOBI** conversion desirable but may be a later phase).
- Students study with materials inside the platform with **AI-supported** guidance:
  - Suggested **daily study** and **review / memorisation** rhythm (e.g. vocabulary).
  - Strategies informed by teacher/backend settings: **memory techniques**, **associative memory**, **root–prefix–suffix** learning.
- Teachers can guide how AI supports students (policies/prompts in backend), not only static task text.

**Not built yet** — see [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md).

---

## Teacher & manager vision (to be detailed by product owner)

**Goal:** AI-assisted lesson preparation and shared interactive teaching pages.

**Planned highlights (summary — full spec pending):**

- Teacher uploads teaching material → system uses **AI** to produce a **learning-oriented HTML document** for teaching.
- **Manager** configures what kind of teaching page AI should generate (templates, rules, scope).
- Teacher uses the HTML page for **classroom interaction**; students view the **same teaching page** and participate in activities.

**Not built yet** — see [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md).

---

## Roadmap phases (high level)

| Phase | Focus | Status |
|-------|--------|--------|
| E–H | Web product, deploy, mobile-friendly UI | Done |
| I0 | HTTPS pilot (Render) | Done |
| I (WeChat) | Student mini-program | **On hold** (code ready; [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md)) |
| **K** | AI + materials + HTML teaching pages | **Vision only** — awaiting detailed spec |
| **L** | Web feature acceleration (non-WeChat) | **Next** |
| **M** | Native: iOS (Xcode), Android (Google Play), HarmonyOS (华为) | After stable web + API |
| J | Institutional pilot, compliance, scale | Ongoing |

---

## Native apps (future — same API)

| Platform | Tooling | Notes |
|----------|---------|--------|
| **iOS** | Xcode (Swift or SwiftUI) | App Store; Bearer token auth like mini-program |
| **Android** | Android Studio / Kotlin | Google Play |
| **HarmonyOS** | 华为开发者平台 (HarmonyOS NEXT / ArkTS as required by Huawei policy at launch time) | China market |

**Approach:** Keep **`/api/v1/*`** and student/teacher API stable; native apps are **clients** (like WeChat), not a second backend.

**Options later:** React Native / Flutter for one codebase → three stores; or three native apps sharing OpenAPI doc.

---

## What not to block on

- WeChat 备案/认证 — resume using [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md) when approved.
- Full AI spec — implement in Phase K after owner document is ready.

---

## References

| Doc | Purpose |
|-----|---------|
| [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md) | AI + materials + HTML lessons (placeholder) |
| [`EAP_PROJECT_TRACKER.md`](../EAP_PROJECT_TRACKER.md) (agent window) | Task tracking |
| `EAPplatform prompt.docx` | Original full vision (external; not in git) |
