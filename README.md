# EAP Platform — Agent Window Build

Separate fork for comparing **Cursor Agent window** vs **traditional Cursor** on Desktop.

| | Agent build | Desktop build |
|---|-------------|-----------------|
| Path | This folder | `~/Desktop/eap_platform` |
| Port | **5051** | **5050** |
| UI | Apple-like shell, random bg (12 images), EN/中文 | Original styling |

**Do not modify** `~/Desktop/eap_platform` from this project.

## Start

```bash
cd "/Users/henryhailyu/Documents/HL folder/Cursor coding file/eap_platform_agent/backend"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
EAP_REQUIRE_SESSION_IDENTITY=1 EAP_ENFORCE_MEMBERSHIP=1 python app.py
```

Open: **http://127.0.0.1:5051/ui/index.html**

## Demo accounts

- Teacher: `teacher1` / `123456` (authorized)
- Teacher (pending): `teacher2` / `123456` — blocked until a manager authorizes
- Student: `student1` / `123456`
- Manager: `manager1` / `123456` → http://127.0.0.1:5051/ui/admin.html
- Class: `EAP047`

## Internal demo (before D64)

1. Start Flask (command above).
2. Optional — refresh sample tasks on the calendar:

```bash
cd backend
python3 scripts/seed_internal_demo.py
```

3. Open http://127.0.0.1:5051/ui/index.html and follow the checklist in `../eap_platform cursor agent window/EAP_PROJECT_TRACKER.md` (section **D62**).

## Design features (Phase R)

- Random background on **each page navigation** (`image-1.jpg` … `image-12.jpg`)
- ~82% white frosted overlay
- Blue `#0071E3` + teal `#0A7EA4` accents
- 「中文」 language toggle (English default)

## Git checkpoints

This folder is a git repo. After each completed task we commit so you can restore:

```bash
cd "/Users/henryhailyu/Documents/HL folder/Cursor coding file/eap_platform_agent"
git log --oneline
git checkout <commit> -- .   # restore files from a commit (careful)
```

## Tracker

See `../eap_platform cursor agent window/EAP_PROJECT_TRACKER.md`
