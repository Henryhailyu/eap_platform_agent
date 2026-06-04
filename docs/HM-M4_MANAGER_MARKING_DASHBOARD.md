# HM-M4 — Manager marking statistics dashboard

## Scope

Manager **Homework AI marking** panel (`admin.html`):

- **Class filter** — all classes or a specific class (default pilot: `EAP047`).
- **Period filter** — all time, 7 / 30 / 90 days (by report `created_at`).
- **Summary** — totals, ready, approved rate, regenerate count, active profiles.
- **Charts** — CSS bar charts: by status, by task category, daily volume (last 14 days in range).
- **CSV export** — one row per AI report with task and approval metadata.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/homework-marking/analytics` | Query: `class_name`, `days` (0–365). Returns `analytics` + `available_classes`. |
| GET | `/api/admin/homework-marking/analytics/export.csv` | Same query params; `Content-Disposition` attachment. |

Requires manager console role (`admin` or `manager`).

## UAT (quick)

1. Log in as `manager1` → Manager centre → **Homework AI marking**.
2. Confirm **EAP047** (or your pilot class) shows summary numbers.
3. Change **Period** to 30 days — charts and totals update.
4. Choose **All classes** — totals may include other classes if present.
5. **Export CSV** — file downloads; open in Excel; columns match API row list.
6. Hard refresh if scripts are cached (`admin-homework-marking.js?v=20260601-hm4`).

## Related

- [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md)
- HM-M3 baseline analytics in `backend/homework_marking.py`
