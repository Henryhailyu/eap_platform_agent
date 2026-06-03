"""Link published teaching pages to calendar tasks (LP-M2 → student calendar)."""
from __future__ import annotations


def enrich_task_dicts_with_teaching_pages(
    conn, task_dicts: list[dict], *, published_only: bool = False
) -> list[dict]:
    """Attach teaching_page / teaching_pages from teacher_teaching_pages.task_id."""
    if not task_dicts:
        return task_dicts
    task_ids = []
    for t in task_dicts:
        tid = t.get("id")
        if tid is None:
            continue
        try:
            task_ids.append(int(tid))
        except (TypeError, ValueError):
            continue
    if not task_ids:
        return task_dicts

    placeholders = ",".join("?" * len(task_ids))
    sql = (
        f"SELECT id, task_id, title, topic, published, published_at "
        f"FROM teacher_teaching_pages WHERE task_id IN ({placeholders})"
    )
    if published_only:
        sql += " AND published = 1"
    sql += " ORDER BY datetime(published_at) DESC, id DESC"
    rows = conn.execute(sql, task_ids).fetchall()
    by_task: dict[int, list[dict]] = {}
    for row in rows:
        tid = int(row["task_id"])
        entry = {
            "id": row["id"],
            "title": row["title"] or "",
            "topic": row["topic"] or "",
            "published": bool(row["published"]),
            "published_at": row["published_at"] or "",
        }
        by_task.setdefault(tid, []).append(entry)

    for t in task_dicts:
        tid = t.get("id")
        try:
            key = int(tid) if tid is not None else None
        except (TypeError, ValueError):
            key = None
        pages = by_task.get(key, []) if key is not None else []
        t["teaching_pages"] = pages
        t["teaching_page"] = pages[0] if pages else None
    return task_dicts
