#!/usr/bin/env python3
"""Verify EAP AI env vars and run minimal chat completions (Phase K2)."""
from __future__ import annotations

import argparse
import json
import os
import sys

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from eap_ai import ai_is_configured, ai_ping, ai_public_status  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Test configured AI providers")
    parser.add_argument(
        "--provider",
        choices=["deepseek", "openai", "all"],
        default="all",
        help="Which provider to ping (default: all configured)",
    )
    args = parser.parse_args()

    status = ai_public_status()
    print(json.dumps({"status": status}, indent=2))
    if not ai_is_configured():
        print("\nAI not configured. Set EAP_AI_ENABLED=1 and provider keys in backend/.env")
        return 1

    providers = ["deepseek", "openai"] if args.provider == "all" else [args.provider]
    exit_code = 0
    for name in providers:
        if not ai_is_configured(name):
            print(f"\n[{name}] skipped — not configured")
            continue
        try:
            result = ai_ping(name)
            print(f"\n[{name}] ping:")
            print(json.dumps(result, indent=2))
            if not result.get("ok"):
                exit_code = 2
        except Exception as exc:  # noqa: BLE001 — CLI diagnostic
            print(f"\n[{name}] ping failed: {exc.__class__.__name__}: {exc}")
            exit_code = 3
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
