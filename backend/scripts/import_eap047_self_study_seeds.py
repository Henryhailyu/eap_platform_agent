#!/usr/bin/env python3
"""Import reviewed EAP047 self-study seed JSON into SQLite (vocabulary + reading)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app import get_db_connection, init_database  # noqa: E402
from self_study_vocabulary import _practice_for_words  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="infile", required=True)
    parser.add_argument("--apply", action="store_true", help="Write to database (default dry-run)")
    args = parser.parse_args()

    data = json.loads(Path(args.infile).read_text(encoding="utf-8"))
    days = data.get("vocabulary", {}).get("days") or []
    print(f"Vocab days in file: {len(days)}")
    for d in days[:3]:
        print(f"  day {d.get('dayNumber')}: {len(d.get('words') or [])} words")

    if not args.apply:
        print("Dry run — pass --apply to import.")
        return 0

    init_database()
    conn = get_db_connection()
    class_name = data.get("className") or "EAP047"
    course = conn.execute(
        "SELECT id FROM vocab_courses WHERE class_name = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        (class_name,),
    ).fetchone()
    if not course:
        print("No active vocab course — run app migrate/seed first.")
        conn.close()
        return 1

    course_id = course["id"]
    for d in days:
        dn = int(d["dayNumber"])
        words = d.get("words") or []
        practice = _practice_for_words(words)
        conn.execute(
            """
            INSERT INTO vocab_course_days (course_id, day_number, words_json, practice_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(course_id, day_number) DO UPDATE SET
              words_json = excluded.words_json,
              practice_json = excluded.practice_json
            """,
            (course_id, dn, json.dumps(words, ensure_ascii=False), json.dumps(practice, ensure_ascii=False)),
        )
    conn.commit()
    conn.close()
    print(f"Imported {len(days)} vocabulary days into course {course_id}.")
    print("Reading import: use manager push flow in a follow-up (SS-R2b).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
