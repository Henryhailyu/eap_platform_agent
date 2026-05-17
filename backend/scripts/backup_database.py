#!/usr/bin/env python3
"""
Phase F: backup SQLite database plus uploads/submissions directories.

Usage:
  cd backend && python scripts/backup_database.py
  python scripts/backup_database.py --out ../backups

Creates a timestamped folder: eap_backup_YYYY-MM-DD_HHMMSS/
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
from datetime import datetime, timezone


def _base_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def backup_sqlite(db_path: str, dest_db: str) -> None:
    if not os.path.isfile(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")
    os.makedirs(os.path.dirname(dest_db), exist_ok=True)
    src = sqlite3.connect(db_path)
    try:
        dst = sqlite3.connect(dest_db)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def copy_tree_if_exists(src: str, dest: str) -> int:
    if not os.path.isdir(src):
        return 0
    shutil.copytree(src, dest, dirs_exist_ok=True)
    count = 0
    for _root, _dirs, files in os.walk(dest):
        count += len(files)
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup EAP SQLite DB and file uploads.")
    parser.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(_base_dir()), "backups"),
        help="Parent directory for backup folders (default: ../backups)",
    )
    args = parser.parse_args()

    base = _base_dir()
    db_path = os.environ.get("EAP_DATABASE_PATH", os.path.join(base, "eap_platform.db"))
    uploads = os.environ.get("EAP_UPLOAD_DIR", os.path.join(base, "uploads"))
    submissions = os.environ.get("EAP_SUBMISSIONS_DIR", os.path.join(base, "submissions"))

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    dest_root = os.path.join(os.path.abspath(args.out), f"eap_backup_{stamp}")
    os.makedirs(dest_root, exist_ok=True)

    dest_db = os.path.join(dest_root, "eap_platform.db")
    backup_sqlite(db_path, dest_db)

    n_up = copy_tree_if_exists(uploads, os.path.join(dest_root, "uploads"))
    n_sub = copy_tree_if_exists(submissions, os.path.join(dest_root, "submissions"))

    manifest = os.path.join(dest_root, "manifest.txt")
    with open(manifest, "w", encoding="utf-8") as fh:
        fh.write(f"created_utc={datetime.now(timezone.utc).isoformat()}\n")
        fh.write(f"source_db={db_path}\n")
        fh.write(f"upload_files={n_up}\n")
        fh.write(f"submission_files={n_sub}\n")

    print(f"Backup written to {dest_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
