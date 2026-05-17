# File upload contract (Phase I2d)

For **WeChat mini-program**, **mobile web**, and API clients using `wx.uploadFile` / `multipart/form-data`.

---

## Homework & revision (students)

| Item | Value |
|------|--------|
| **Endpoints** | `POST /api/tasks/<id>/submit`, `PUT /api/submissions/<id>/revision` |
| **Content-Type** | `multipart/form-data` |
| **File field name** | `file` |
| **Allowed extensions** | `pdf`, `doc`, `docx`, `txt`, `jpg`, `png` |
| **Text fields** | `answer_text` / `revision_text`, `class_name` (required), optional `student_name` |
| **Rule** | At least one of non-empty text **or** `file` |

### WeChat `wx.uploadFile`

```javascript
wx.uploadFile({
  url: 'https://your-host/api/tasks/12/submit',
  filePath: tempFilePath,
  name: 'file',
  formData: { class_name: 'EAP047', answer_text: '…' },
  header: { Authorization: 'Bearer <token>' },
});
```

- Default WeChat per-file limit: **10 MB** (platform limit; cannot be raised in mini-program).  
- Server has no hard byte cap in code today; keep files **≤ 10 MB** for WeChat compatibility.  
- Recommended pilot limit: **16 MB** on reverse proxy (nginx `client_max_body_size`) if you add large teacher uploads on web only.

### Text-only submit (no attachment)

WeChat requires `filePath` for `uploadFile`. The mini-program writes a temporary `.txt` file under `USER_DATA_PATH` and uploads it — same server validation as a real file.

---

## Teacher materials (reference)

| Item | Value |
|------|--------|
| **Endpoint** | `POST /api/tasks/<id>/upload` (session cookie; not in student mini MVP) |
| **Extensions** | `pdf`, `doc`, `docx`, `ppt`, `pptx`, `mp3`, `mp4`, `txt`, `jpg`, `png` |
| **Storage URL** | `GET /uploads/<basename>` with `Authorization: Bearer` when security flags on |

---

## Downloads

| Path | Auth |
|------|------|
| `GET /uploads/<basename>` | Bearer or session |
| `GET /submission-files/<basename>` | Bearer or session |

Use stored **basename** from JSON (`file_path` field), not full server paths.

---

## Machine-readable contract

`GET /api/v1/upload-contract` (no auth):

```json
{
  "homework_extensions": ["doc", "docx", "jpg", "pdf", "png", "txt"],
  "teacher_material_extensions": ["doc", "docx", "jpg", "mp3", "mp4", "pdf", "png", "ppt", "pptx", "txt"],
  "max_bytes_recommended": 16777216,
  "wechat_upload_limit_bytes": 10485760
}
```

---

*See also [`API_STUDENT_MINI.md`](API_STUDENT_MINI.md).*
