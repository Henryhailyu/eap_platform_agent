#!/usr/bin/env python3
"""
Generate EAP047 self-study seed drafts (vocabulary 30-day + reading passages) via AI.

Output JSON for human review BEFORE importing to production DB.

  cd backend
  set -a && source ../.env && set +a   # EAP_OPENAI_* / Hunyuan
  python3 scripts/generate_eap047_self_study_seeds.py --out ../data/seeds/eap047_draft.json
  python3 scripts/generate_eap047_self_study_seeds.py --days 30 --reading 10 --out ../data/seeds/eap047_draft.json

After you approve the JSON:
  python3 scripts/import_eap047_self_study_seeds.py --in ../data/seeds/eap047_draft.json --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def _ai_json(system: str, user: str) -> dict:
    from eap_ai import ai_is_configured, create_chat_completion, get_openai_client, parse_ai_json_object

    if not ai_is_configured():
        raise SystemExit("AI not configured — set EAP_AI_ENABLED=1 and EAP_OPENAI_* in .env")
    client, profile = get_openai_client(None)
    resp = create_chat_completion(
        client,
        profile,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.4,
        max_tokens=4000,
    )
    return parse_ai_json_object(resp.choices[0].message.content or "")


def generate_vocab_day(day_number: int, used_words: list[str]) -> dict:
    system = (
        "You generate academic English vocabulary lessons for EAP047 (IELTS ~6.5). "
        "Return JSON: {words: [{word, phonetic, coreMeaning, methodPrimary: affix|mnemonic|mixed, "
        "affix: {prefix, root, suffix, gloss}, mnemonic, examples: [sentence]}]} — exactly 30 unique words. "
        "No duplicates from the used_words list."
    )
    user = f"Day {day_number}. Avoid words: {', '.join(used_words[-120:])}"
    return _ai_json(system, user)


def generate_reading_passage(index: int, word_target: int = 750) -> dict:
    system = (
        "Generate one IELTS Academic reading passage for EAP047. Return JSON with: title, passageEn ("
        f"{word_target}-900 words), passageZh (summary translation), questions (13-14 items) each with "
        "id, typeId (MC|TFNG|YNNG|MH|MI|MF|MSE|SC|SumC|NTCD|SAQ|CL|SL), promptEn, promptZh, "
        "optionsEn/optionsZh or correctIndex, evidenceEn, evidenceZh. Original content only."
    )
    user = f"Passage index {index} — topic: contemporary university learning or sustainability science."
    return _ai_json(system, user)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3, help="Vocab days to generate (default 3 for draft; use 30 for full month)")
    parser.add_argument("--reading", type=int, default=2, help="Reading passages to generate")
    parser.add_argument("--out", required=True, help="Output JSON path")
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    used: list[str] = []
    vocab_days = []
    for d in range(1, args.days + 1):
        print(f"Generating vocabulary day {d}/{args.days}…")
        payload = generate_vocab_day(d, used)
        words = payload.get("words") or []
        for w in words:
            if w.get("word"):
                used.append(w["word"])
        vocab_days.append({"dayNumber": d, "words": words})
        print(f"  → {len(words)} words")

    readings = []
    for i in range(1, args.reading + 1):
        print(f"Generating reading passage {i}/{args.reading}…")
        readings.append(generate_reading_passage(i))

    draft = {
        "className": "EAP047",
        "vocabulary": {"courseTitle": "EAP047 Academic Word Builder (AI draft)", "days": vocab_days},
        "reading": {"passages": readings},
        "note": "Review this file before running import_eap047_self_study_seeds.py --apply",
    }
    out_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
