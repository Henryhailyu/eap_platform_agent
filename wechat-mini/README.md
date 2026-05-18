# EAP Student — WeChat Mini Program (Phase I3 scaffold)

Native WeChat mini-program for the **student daily loop**: login → month calendar → day tasks → submit / revision → learning archive.

Teachers and managers continue to use the web UI at `/ui/`.

## Prerequisites

1. Complete **[`docs/PILOT_DEPLOY.md`](../docs/PILOT_DEPLOY.md)** (HTTPS pilot live, passwords rotated).  
2. Read **[`docs/API_STUDENT_MINI.md`](../docs/API_STUDENT_MINI.md)**.

## Setup

**Account:** EAP学习助手 · AppID `wx1b1247067a43152` (in `project.config.json`).  
**Do not** put AppSecret in this repo — backend env only when you add `wx.login` later.

1. Install [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).  
2. **导入项目** → choose this `wechat-mini/` folder (not an empty template).  
3. Edit **`config.js`** — set `apiBase` to your HTTPS pilot URL (no trailing slash):

   ```js
   apiBase: 'https://eap-pilot.onrender.com',
   ```

4. For local backend only (not production): enable **详情 → 本地设置 → 不校验合法域名、web-view、TLS** in devtools.  
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

- Add `apiBase` host to **request合法域名** and **uploadFile合法域名**.  
- Submit for review (education category).  
- Future: `wx.login` + server openid bind (not in this scaffold).

## Verify API before UI

```bash
cd ../backend
python scripts/verify_pilot.py --base https://your-host --password 'your-password'
```
