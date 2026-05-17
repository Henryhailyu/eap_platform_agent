#!/usr/bin/env python3
"""
Seed polished tasks for internal demo (class EAP047, May 2026).
Safe to re-run: updates known demo rows by title or inserts if missing.

Usage (from backend/):
  python scripts/seed_internal_demo.py
"""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "eap_platform.db")

DEMO_TASKS = [
    {
        "date": "2026-05-17",
        "title": "Academic hedging language",
        "title_zh": "学术含糊限制语",
        "category": "Vocabulary",
        "period": "P1",
        "description": "Read Unit 3 and complete the hedging worksheet (PDF on Moodle).",
        "description_zh": "阅读第三单元并完成含糊限制语练习题（Moodle 上的 PDF）。",
    },
    {
        "date": "2026-05-19",
        "title": "Listening — lecture note-taking",
        "title_zh": "听力 — 讲座笔记",
        "category": "Listening",
        "period": "P2",
        "description": "Watch the 12-minute clip and submit structured notes.",
        "description_zh": "观看 12 分钟视频并提交结构化笔记。",
    },
    {
        "date": "2026-05-21",
        "title": "Writing — draft paragraph",
        "title_zh": "写作 — 段落初稿",
        "category": "Writing",
        "period": "P3",
        "description": "Upload a 150-word draft with clear topic sentence and hedging.",
        "description_zh": "上传 150 词初稿，需有清晰主题句并使用含糊限制语。",
    },
]


def main():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    class_name = "EAP047"

    for t in DEMO_TASKS:
        row = conn.execute(
            """
            SELECT id FROM calendar_tasks
            WHERE class_name = ? AND date = ? AND title = ?
            """,
            (class_name, t["date"], t["title"]),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE calendar_tasks SET
                  title_zh = ?, category = ?, period = ?,
                  description = ?, description_zh = ?, status = 'Pending'
                WHERE id = ?
                """,
                (
                    t["title_zh"],
                    t["category"],
                    t["period"],
                    t["description"],
                    t["description_zh"],
                    row["id"],
                ),
            )
            print(f"Updated task id={row['id']} ({t['date']} — {t['title']})")
        else:
            conn.execute(
                """
                INSERT INTO calendar_tasks
                  (date, title, title_zh, category, period, description, description_zh, status, class_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
                """,
                (
                    t["date"],
                    t["title"],
                    t["title_zh"],
                    t["category"],
                    t["period"],
                    t["description"],
                    t["description_zh"],
                    class_name,
                ),
            )
            print(f"Inserted {t['date']} — {t['title']}")

    conn.commit()
    conn.close()
    print("Done. Demo class:", class_name)


if __name__ == "__main__":
    main()
