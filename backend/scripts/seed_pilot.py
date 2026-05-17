#!/usr/bin/env python3
"""
Phase G: ensure pilot class + demo accounts exist (idempotent).

Usage (from backend/, after init_database):
  EAP_SEED_DEMO_TASKS=1 python scripts/seed_internal_demo.py   # optional sample tasks
  python scripts/seed_pilot.py

Environment:
  EAP_DATABASE_PATH — SQLite file (default backend/eap_platform.db)
  EAP_PILOT_CLASS — class code (default EAP047)
  EAP_PILOT_DEFAULT_PASSWORD — if set, reset demo account passwords to this value (production)
"""
from __future__ import annotations

import os
import sqlite3
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from werkzeug.security import generate_password_hash  # noqa: E402

DATABASE_PATH = os.environ.get(
    "EAP_DATABASE_PATH",
    os.path.join(BASE_DIR, "eap_platform.db"),
)
PILOT_CLASS = (os.environ.get("EAP_PILOT_CLASS") or "EAP047").strip()
PILOT_PASSWORD = (os.environ.get("EAP_PILOT_DEFAULT_PASSWORD") or "").strip()

DEMO_USERNAMES = ("teacher1", "student1", "manager1", "teacher2")


def main() -> int:
    if not os.path.isfile(DATABASE_PATH):
        print(f"Database not found: {DATABASE_PATH} — run the app once to create tables.")
        return 1

    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT id FROM classes WHERE class_code = ?",
            (PILOT_CLASS,),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO classes (class_code, display_name, course_code, semester, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
                """,
                (PILOT_CLASS, f"Pilot class {PILOT_CLASS}", PILOT_CLASS, "Pilot"),
            )
            print(f"Created class {PILOT_CLASS}")

        if PILOT_PASSWORD:
            h = generate_password_hash(PILOT_PASSWORD)
            for uname in DEMO_USERNAMES:
                conn.execute(
                    """
                    UPDATE users SET password_hash = ?, password = ''
                    WHERE username = ?
                    """,
                    (h, uname),
                )
            print(f"Updated passwords for: {', '.join(DEMO_USERNAMES)}")

        conn.commit()
        print(f"Pilot ready — class {PILOT_CLASS}, DB {DATABASE_PATH}")
        print("UI: /ui/index.html  |  Manager: /ui/admin.html")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
