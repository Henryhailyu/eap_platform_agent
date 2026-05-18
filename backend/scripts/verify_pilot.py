#!/usr/bin/env python3
"""
I0: smoke-test a deployed (or local) EAP pilot — health, v1 auth, Bearer student APIs.

  python scripts/verify_pilot.py --base http://127.0.0.1:5051 --password '123456'
  python scripts/verify_pilot.py --base https://eap-pilot.onrender.com --password 'secret'
"""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request


def _ssl_context() -> ssl.SSLContext:
    """Works on macOS Python.org installs (often missing default CA bundle)."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

DEFAULT_CLASS = "EAP047"
STUDENT_USER = "student1"


def request_json(method: str, url: str, body=None, headers=None):
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return e.code, payload


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = "OK" if ok else "FAIL"
    line = f"  [{mark}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify EAP pilot deployment")
    parser.add_argument("--base", required=True, help="API base URL, e.g. https://host or http://127.0.0.1:5051")
    parser.add_argument("--password", default="123456", help="student1 password")
    parser.add_argument("--class-name", default=DEFAULT_CLASS, help="Class code (default EAP047)")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    class_name = args.class_name.strip()

    print(f"Verifying {base} (class {class_name})…\n")
    all_ok = True

    code, health = request_json("GET", f"{base}/api/health")
    all_ok &= check(
        "GET /api/health",
        code == 200 and health.get("status") in ("ok", "degraded"),
        f"status={health.get('status')} strict={health.get('strict_security')}",
    )

    code, pilot = request_json("GET", f"{base}/api/pilot/info")
    pilot_ok = code == 200 and pilot.get("pilot") is True
    if not pilot_ok:
        check("GET /api/pilot/info", True, f"skipped (http {code}; enable EAP_PILOT_MODE=1 on pilot hosts)")
    else:
        all_ok &= check("GET /api/pilot/info", True, "pilot mode on")

    code, login = request_json(
        "POST",
        f"{base}/api/v1/auth/login",
        {"username": STUDENT_USER, "password": args.password},
    )
    token = login.get("access_token") if code == 200 else None
    all_ok &= check("POST /api/v1/auth/login", code == 200 and bool(token), f"http {code}")

    if not token:
        print("\nStopped: cannot continue without access_token.")
        return 1

    auth = {"Authorization": f"Bearer {token}"}

    code, me = request_json("GET", f"{base}/api/v1/auth/me", headers=auth)
    all_ok &= check(
        "GET /api/v1/auth/me",
        code == 200 and me.get("user", {}).get("username") == STUDENT_USER,
        f"http {code}",
    )

    code, classes = request_json("GET", f"{base}/api/student/my-classes", headers=auth)
    has_class = any(
        c.get("class_code") == class_name for c in (classes.get("classes") or [])
    )
    all_ok &= check("GET /api/student/my-classes", code == 200 and has_class, f"http {code}")

    code, tasks = request_json(
        "GET",
        f"{base}/api/tasks?class_name={class_name}",
        headers=auth,
    )
    all_ok &= check(
        "GET /api/tasks",
        code == 200 and isinstance(tasks, list),
        f"http {code} count={len(tasks) if isinstance(tasks, list) else 'n/a'}",
    )

    code, progress = request_json(
        "GET",
        f"{base}/api/student/progress?class_name={class_name}&month=2026-05",
        headers=auth,
    )
    all_ok &= check(
        "GET /api/student/progress",
        code == 200 and progress.get("student_username") == STUDENT_USER,
        f"http {code}",
    )

    code, archive = request_json(
        "GET",
        f"{base}/api/student/learning-archive?class_name={class_name}",
        headers=auth,
    )
    all_ok &= check(
        "GET /api/student/learning-archive",
        code == 200 and "items" in archive,
        f"http {code}",
    )

    code, upload_contract = request_json("GET", f"{base}/api/v1/upload-contract")
    all_ok &= check(
        "GET /api/v1/upload-contract",
        code == 200 and "homework_extensions" in upload_contract,
        f"http {code}",
    )

    code, cal = request_json("GET", f"{base}/api/academic-calendar")
    all_ok &= check(
        "GET /api/academic-calendar",
        code == 200 and "semester_start_date" in cal,
        f"http {code}",
    )

    code, bad = request_json(
        "POST",
        f"{base}/api/v1/auth/login",
        {"username": STUDENT_USER, "password": "wrong-password"},
    )
    all_ok &= check(
        "v1 login error code",
        code == 401 and bad.get("code") == "AUTH_INVALID_CREDENTIALS",
        f"http {code}",
    )

    print()
    if all_ok:
        print("All checks passed.")
        return 0
    print("Some checks failed — fix deployment or credentials before go-live.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
