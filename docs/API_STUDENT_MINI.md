# Student WeChat mini-program — API reference (MVP)

**Base URL:** your HTTPS pilot host (e.g. `https://eap-pilot.example.com`).  
**Auth:** Bearer token from Phase I2a/I2b (no Flask session cookie required).  
**Production flags:** set `EAP_REQUIRE_SESSION_IDENTITY=1` and `EAP_ENFORCE_MEMBERSHIP=1` on the server.

---

## Authentication

### Login

`POST /api/v1/auth/login`

```json
{ "username": "student1", "password": "your-password" }
```

**200**

```json
{
  "success": true,
  "access_token": "<signed-token>",
  "expires_in": 604800,
  "token_type": "Bearer",
  "user": {
    "id": 2,
    "username": "student1",
    "role": "student",
    "full_name": "Demo Student",
    "class_name": "EAP047",
    "is_authorized": true
  }
}
```

**401** — `{ "success": false, "message": "Invalid username or password" }`

Store `access_token` in memory or WeChat secure storage. Send on every request:

```
Authorization: Bearer <access_token>
```

Default TTL: 7 days (`EAP_TOKEN_TTL_SECONDS`).

### Current user

Either endpoint works with Bearer:

| Method | Path |
|--------|------|
| GET | `/api/v1/auth/me` |
| GET | `/api/me` |

**401 (v1):** `{ "success": false, "message": "Invalid or expired access token" }`  
**401 (legacy /api/me):** `{ "success": false, "message": "Not logged in" }`

### Logout (client-side)

`POST /api/logout` only clears server **session** cookies. For the mini-program, delete the stored token locally. No server revoke endpoint yet.

---

## Common errors

| HTTP | Body shape | Meaning |
|------|------------|---------|
| 400 | `{ "error": "..." }` | Missing/invalid query or body |
| 401 | `{ "error": "Not logged in" }` or v1 `success`/`message` | Missing/expired Bearer |
| 403 | `{ "error": "Forbidden" }` / `Wrong role` / enrollment messages | Not allowed for this class or resource |
| 404 | `{ "error": "Task not found" }` etc. | Missing row |

With Bearer + strict flags, **do not** send `student_username` in query/body unless you are in legacy dev mode — the token identity is authoritative.

---

## Recommended call flow (MVP pages)

1. **Login** → save token + `user.class_name` (default class hint).
2. **My classes** → `GET /api/student/my-classes` (pick active class).
3. **Month calendar** → `GET /api/tasks?class_name=EAP047` (filter `date` client-side by `YYYY-MM`) **or** `GET /api/student/progress?class_name=EAP047&month=2026-05` for summary.
4. **Day list** → `GET /api/tasks?class_name=EAP047&date=2026-05-10`.
5. **Completions overlay** → `GET /api/tasks/my-completions?class_name=EAP047&task_ids=1,2,3`.
6. **Task detail** → task from list + `GET /api/tasks/{id}/my-submission?class_name=EAP047`.
7. **Submit** → `POST /api/tasks/{id}/submit` (multipart).
8. **Revision** → `PUT /api/submissions/{id}/revision` (multipart).
9. **Mark complete** → `PUT /api/tasks/{id}/my-completion` (JSON).
10. **Archive** → `GET /api/student/learning-archive?class_name=EAP047&month=2026-04`.

---

## Endpoints

### Health / pilot

| GET | Path | Auth | Notes |
|-----|------|------|-------|
| ✓ | `/api/health` | No | Deploy check |
| ✓ | `/api/pilot/info` | No | Onboarding JSON when `EAP_PILOT_MODE=1` |

### Classes

**GET** `/api/student/my-classes`

Bearer required in production.

**200**

```json
{
  "student_username": "student1",
  "classes": [
    {
      "id": 1,
      "class_code": "EAP047",
      "display_name": "EAP047",
      "enrolled_at": "2026-05-17T01:01:13Z"
    }
  ]
}
```

### Academic calendar

**GET** `/api/academic-calendar`

No auth. Used for teaching-week labels and holiday notes.

**200**

```json
{
  "semester_start_date": "2026-01-06",
  "teaching_weeks": 16,
  "notable_dates": { "2026-02-10": "Spring Festival" }
}
```

### Tasks (calendar feed)

**GET** `/api/tasks`

| Query | Required (strict) | Description |
|-------|-------------------|-------------|
| `class_name` | Yes | e.g. `EAP047` |
| `date` | No | `YYYY-MM-DD` — day filter |

Returns a **JSON array** of task objects (not wrapped in `{ tasks: [] }`).

**Task object fields**

| Field | Type | Notes |
|-------|------|-------|
| `id` | int | |
| `date` | string | `YYYY-MM-DD` |
| `title`, `title_zh` | string | |
| `description`, `description_zh` | string | |
| `category` | string | |
| `period` | string | |
| `status` | string | Global task status (not per-student) |
| `class_name` | string | |
| `file_path`, `file_name` | string | Teacher material; see Files below |

**Month view:** fetch all tasks for `class_name`, then filter where `date.startsWith("2026-05")`.

### Per-student completion

**GET** `/api/tasks/my-completions?class_name=EAP047&task_ids=1,2,3`

**200**

```json
{
  "student_username": "student1",
  "class_name": "EAP047",
  "completions": {
    "1": {
      "task_id": 1,
      "status": "Pending",
      "completed": false,
      "completed_at": null
    }
  }
}
```

**GET** `/api/tasks/{task_id}/my-completion?class_name=EAP047`

Single-task completion (same entry shape as values in `completions`).

**PUT** `/api/tasks/{task_id}/my-completion`

```json
{
  "class_name": "EAP047",
  "status": "Completed"
}
```

`status`: `Pending` or `Completed` (case-insensitive).

### Homework — read

**GET** `/api/tasks/{task_id}/my-submission?class_name=EAP047`

**200** — submission object, or JSON `null` if none yet.

**Submission object** (key fields)

| Field | Notes |
|-------|-------|
| `id`, `task_id` | |
| `answer_text` | |
| `file_path`, `file_name` | Stored basename; download via Files |
| `submitted_at` | ISO UTC |
| `teacher_feedback` | Text feedback |
| `status` | e.g. `Submitted` |
| `revision_text`, `revision_file_path`, `revision_file_name`, `revision_submitted_at` | |
| `feedback_file_path`, `feedback_file_name` | |
| `feedback_attachments` | Array of `{ id, file_path, file_name, ... }` |

### Homework — submit

**POST** `/api/tasks/{task_id}/submit`

`Content-Type: multipart/form-data`

| Field | Required | Notes |
|-------|----------|-------|
| `class_name` | Yes | Must match task class |
| `answer_text` | One of text/file | |
| `file` | One of text/file | pdf, doc, docx, txt, jpg, png |
| `student_name` | No | Display name |
| `student_id` | No | User id from login |

**201** — full submission object.

WeChat: use `wx.uploadFile` with `name: "file"` and other fields in `formData`.

### Homework — revision

**PUT** `/api/submissions/{submission_id}/revision`

`multipart/form-data`

| Field | Required |
|-------|----------|
| `class_name` | Yes (must match submission) |
| `revision_text` | One of text/file |
| `file` | One of text/file (same types as submit) |

**200** — updated submission object. Overwrites the single revision slot.

### Progress dashboard

**GET** `/api/student/progress?class_name=EAP047&month=2026-05`

Optional `date=YYYY-MM-DD` (overrides `month`).

**200** — includes counts (`total_tasks`, `completed_tasks`, `homework_submitted_count`, `feedback_received_count`, …), `tasks_needing_action`, `category_summary`, etc.

### Learning archive (read-only)

**GET** `/api/student/learning-archive?class_name=EAP047`

| Query | Notes |
|-------|-------|
| `month` | Optional `YYYY-MM` |
| `category` | Optional exact category filter |

**200**

```json
{
  "student_username": "student1",
  "class_name": "EAP047",
  "month": "2026-05",
  "category": null,
  "total": 12,
  "items": [ ]
}
```

Each `items[]` entry includes task summary, submission, feedback, and revision fields for portfolio UI.

---

## Files (downloads)

When security flags are on, file GETs require the same `Authorization: Bearer` header.

| Resource | URL pattern |
|----------|-------------|
| Teacher task material | `GET /uploads/{basename}` |
| Student / feedback files | `GET /submission-files/{basename}` |

`basename` is the stored filename from API fields (`file_path`, `revision_file_path`, `feedback_file_path`, attachment `file_path`) — not a full path.

**Example:** if `file_path` is `a1b2c3d4.pdf`, request:

```
GET https://your-host/submission-files/a1b2c3d4.pdf
Authorization: Bearer <token>
```

WeChat: add the API host to **request合法域名** in the mini-program admin console.

---

## Deferred (not in student MVP)

- Study plans (`/api/student/study-plans/*`)
- Teacher routes, admin, task templates
- WeChat `wx.login` / openid bind (future I3+)
- Subscribe messages (Phase I4)

---

## Local smoke test

```bash
BASE=http://127.0.0.1:5051
TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"student1","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s "$BASE/api/student/my-classes" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/tasks?class_name=EAP047&date=2026-05-10" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/student/progress?class_name=EAP047&month=2026-05" -H "Authorization: Bearer $TOKEN"
```

---

*Phase I2c — 2026-05-17. Server implementation: `eap_platform_agent` on port 5051.*
