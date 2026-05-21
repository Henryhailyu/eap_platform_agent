# WeChat mini-program go-live (after 备案 / 认证)

**App:** EAP学习助手 · AppID `wx1b1247067a43152`  
**API host:** `eap-platform-pilot.onrender.com`  
**Status:** **ON HOLD** (2026-05-21) — product focus is web-first until 备案/认证. Code remains on `main`; resume with this checklist when approved.

---

## Before you start

| Prerequisite | Check |
|--------------|-------|
| Render pilot **Live** | https://eap-platform-pilot.onrender.com/api/health → `"status":"ok"` |
| Passwords rotated | `seed_pilot.py` on Render Shell |
| `verify_pilot.py` | All checks passed on HTTPS |
| 备案 + 微信认证 | Approved in mp.weixin.qq.com |

---

## 1. Code (already set)

`wechat-mini/config.js`:

- `USE_LOCAL_DEV = false`
- `apiBase = https://eap-platform-pilot.onrender.com`

For **DevTools-only** testing on your Mac: set `USE_LOCAL_DEV = true`, run `./start_dev.sh`, enable **不校验合法域名**.

---

## 2. WeChat admin — 服务器域名

1. Log in https://mp.weixin.qq.com/  
2. **开发** → **开发管理** → **开发设置** → **服务器域名**  
3. Add (no `https://`, no path):

| Type | Domain |
|------|--------|
| request 合法域名 | `eap-platform-pilot.onrender.com` |
| uploadFile 合法域名 | `eap-platform-pilot.onrender.com` |
| downloadFile 合法域名 | `eap-platform-pilot.onrender.com` |

4. Save and wait for WeChat approval (can take hours).

---

## 3. Upload & 体验版

1. Open `wechat-mini/` in **微信开发者工具** (import project, not empty template).  
2. Confirm AppID matches `project.config.json`.  
3. **上传** → version note e.g. `pilot-2026-05`.  
4. mp.weixin.qq.com → **管理** → **版本管理** → **开发版本** → submit **体验版**.  
5. **成员管理** → add 体验成员 (your WeChat account).

---

## 4. Real-phone test (体验版)

| Step | Action |
|------|--------|
| 1 | Scan 体验版 QR in WeChat |
| 2 | Login `student1` / pilot password |
| 3 | Calendar → day → task → submit |
| 4 | Open a PDF / file if task has materials |
| 5 | Toggle 中文 on login/calendar |

If **request:fail** or domain errors → recheck 服务器域名 and `config.js` host.

---

## 5. Submit for review (正式版)

When 体验版 is stable:

1. mp.weixin.qq.com → **版本管理** → submit **审核**  
2. Category: education / 教育  
3. Privacy policy URL (school or simple page) — prepare with I5  
4. After approval → **发布**

---

## 6. Cold start (Render)

First open after idle may delay **30–90 s**. Optional: open `/api/health` in browser before demo.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `request:fail url not in domain list` | Whitelist `eap-platform-pilot.onrender.com` |
| Login 401 | Password must match Render `seed_pilot.py` |
| 502 on API | Wait for Render wake-up; retry |
| DevTools OK, phone fails | Domains not approved or `USE_LOCAL_DEV` still true |

---

*Teachers stay on web:* https://eap-platform-pilot.onrender.com/ui/teacher.html
