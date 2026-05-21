# Web-first roadmap (WeChat suspended)

**Decision (2026-05-21):** Pause WeChat go-live until authorization. **Accelerate website** features on Render. Native apps (iOS / Android / HarmonyOS) after web + API are stable.

---

## Active now

| Track | Work |
|-------|------|
| **Web pilot** | Real class use, bug fixes, [`I0_PHONE_PILOT.md`](I0_PHONE_PILOT.md) |
| **Ops** | [`RENDER_OPS.md`](RENDER_OPS.md) — backups, cold start |
| **Web features (L)** | Next coding tasks — see tracker; no WeChat dependency |

---

## On hold

| Track | Resume when |
|-------|-------------|
| **WeChat** | 备案/认证 + [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md) |
| **Phase K AI** | Owner detailed spec in [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md) |

---

## Later — native apps (Phase M)

Same backend as web:

1. Freeze **student + teacher API** subset (OpenAPI / `API_STUDENT_MINI.md` + teacher routes).
2. **iOS** — Xcode project, Bearer auth, WebView or native UI.
3. **Android** — Google Play.
4. **HarmonyOS** — 华为开发者平台 (follow Huawei’s current app stack requirements).

WeChat mini can remain one of several clients, not the only mobile path.

---

## Why this order is OK

- One HTTPS site teaches and deploys **faster** than four platforms at once.
- Teachers already work in **browser**; students can use mobile web until native apps ship.
- WeChat code on `main` stays ready; no throwaway work.
- Native stores need the same **privacy, login, and file APIs** the web pilot proves.
