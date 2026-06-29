# EAP Student — WeChat Mini Program (Phase I3)

Native WeChat mini-program for the **student daily loop**: login → month calendar → day tasks → submit / revision → learning archive.

**API:** `https://elc-eap-platform.top` · **Next:** P4 体验版真机 — see [`docs/WECHAT_GO_LIVE.md`](../docs/WECHAT_GO_LIVE.md).

Teachers and managers continue to use the web UI at `/ui/`.

## Prerequisites

1. Complete **[`docs/PILOT_DEPLOY.md`](../docs/PILOT_DEPLOY.md)** (HTTPS pilot live, passwords rotated).  
2. Read **[`docs/API_STUDENT_MINI.md`](../docs/API_STUDENT_MINI.md)**.

## Setup

**Account:** EAP伴学助手 · AppID `wx1b12474067a43152` (in `project.config.json`).  
**Do not** put AppSecret in this repo — backend env only when you add `wx.login` later.

1. Install [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).  
2. **导入项目** → choose this `wechat-mini/` folder (not an empty template).  
3. **`config.js`** — production URL is preset (`https://elc-eap-platform.top`).  
   For **local Mac backend only:** set `USE_LOCAL_DEV = true` in `config.js`.

4. Local DevTools: enable **详情 → 本地设置 → 不校验合法域名、web-view、TLS**.  
5. Build & preview with demo account `student1` and your pilot password.

## Features (Phase I3 polish)

- **EN / 中文** toggle on login and calendar (`utils/i18n.js`)
- **Class picker** when enrolled in multiple classes (tap class name on calendar)
- **Academic calendar** — teaching week label + holiday markers on month grid
- **File open** — teacher materials and submission files via Bearer download (`utils/files.js`)

## Pages

| Page | Path | Purpose |
|------|------|---------|
| Login | `pages/login/` | Username/password → Bearer token |
| Calendar | `pages/calendar/` | Month grid + task counts |
| Day | `pages/day/` | Tasks for one date |
| Task | `pages/task/` | Detail, completion, submit, revision |
| Archive | `pages/archive/` | Learning archive (read-only) |

## Project layout

```
wechat-mini/
  app.js / app.json / app.wxss
  config.js          ← set apiBase here
  utils/api.js       ← Bearer requests + upload
  pages/…
```

## WeChat admin (go-live)

- Add `apiBase` host to **request合法域名**, **uploadFile合法域名**, **downloadFile合法域名**.  
- Privacy policy URL for review: `https://elc-eap-platform.top/ui/privacy.html`  
- Configure **用户隐私保护指引** in mp admin to match `frontend/privacy.html`.  
- Submit for review (education category).  
- Future: `wx.login` + server openid bind (not in this scaffold).

## Verify API before UI

```bash
cd ../backend
python scripts/verify_pilot.py --base https://your-host --password 'your-password'
```
