#!/usr/bin/env python3
"""
Generate EAP047 self-study seed drafts (vocabulary 30-day + reading passages) via AI.

Output JSON for human review BEFORE importing to production DB.

  # Lighthouse (inside Docker — host python3 lacks flask/openai):
  ./ops/lighthouse-generate-seeds.sh

After you approve the JSON:
  ./ops/lighthouse-import-seeds.sh
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

MAX_RETRIES = 3


def _ai_json(system: str, user: str, *, max_tokens: int = 8000) -> dict:
    from eap_ai import ai_is_configured, create_chat_completion, format_ai_error, get_openai_client, parse_ai_json_object

    if not ai_is_configured():
        raise SystemExit("AI not configured — set EAP_AI_ENABLED=1 and EAP_OPENAI_* in .env")

    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            client, profile = get_openai_client(None)
            resp = create_chat_completion(
                client,
                profile,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0.35,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            raw = (resp.choices[0].message.content or "").strip()
            if not raw:
                raise RuntimeError("Empty AI response")
            return parse_ai_json_object(raw)
        except Exception as exc:
            last_err = exc
            print(f"    … AI attempt {attempt}/{MAX_RETRIES} failed: {format_ai_error(exc)}", file=sys.stderr)
            if attempt < MAX_RETRIES:
                time.sleep(2 * attempt)
    raise RuntimeError(f"AI failed after {MAX_RETRIES} attempts") from last_err


def generate_vocab_batch(
    day_number: int,
    batch_no: int,
    *,
    count: int,
    used_words: list[str],
) -> list[dict]:
    system = (
        "You generate academic English vocabulary for EAP047 (IELTS ~6.5). "
        "Return compact JSON only: {\"words\": [{\"word\", \"phonetic\", \"coreMeaning\", "
        "\"methodPrimary\": \"affix|mnemonic|mixed\", \"affix\": {\"prefix\",\"root\",\"suffix\",\"gloss\"}, "
        "\"mnemonic\", \"examples\": [\"one short sentence\"]}]}. "
        f"Exactly {count} unique words. Keep fields concise. No markdown."
    )
    avoid = ", ".join(used_words[-80:]) if used_words else "(none)"
    user = f"Day {day_number}, batch {batch_no}. Generate {count} new words. Do not repeat: {avoid}"
    payload = _ai_json(system, user, max_tokens=6000)
    words = payload.get("words") or []
    if len(words) < count:
        print(f"    warning: batch returned {len(words)} words (wanted {count})", file=sys.stderr)
    return words


def generate_vocab_day(day_number: int, used_words: list[str]) -> list[dict]:
    """30 words/day in two API calls (15+15) to avoid JSON truncation."""
    words: list[dict] = []
    for batch_no, n in ((1, 15), (2, 15)):
        print(f"    batch {batch_no}/2 ({n} words)…")
        batch = generate_vocab_batch(day_number, batch_no, count=n, used_words=used_words + words)
        for w in batch:
            token = str(w.get("word") or "").strip().lower()
            if token and token not in {x.lower() for x in used_words} and token not in {
                str(x.get("word") or "").lower() for x in words
            }:
                words.append(w)
        if len(words) >= 30:
            break
    return words[:30]


def generate_reading_passage(index: int, word_target: int = 700) -> dict:
    """Passage body first, then questions — two calls to stay within token limits."""
    system_passage = (
        "Return JSON: {title, passageEn, passageZh}. passageEn must be original IELTS Academic "
        f"prose about {word_target}-850 words. passageZh is a faithful summary (not word-for-word)."
    )
    user_passage = (
        f"Passage {index} — topic: university research ethics OR urban sustainability (alternate)."
    )
    body = _ai_json(system_passage, user_passage, max_tokens=12000)

    excerpt = (body.get("passageEn") or "")[:6000]
    system_q = (
        "Return JSON: {questions: [{id, typeId, promptEn, promptZh, optionsEn, optionsZh, "
        "correctIndex, evidenceEn, evidenceZh}]}. Create 13-14 IELTS-style questions. "
        "typeId one of MC, TFNG, YNNG, MH, MI, MF, MSE, SC, SumC, NTCD, SAQ, CL, SL. "
        "Answers must be supported by the passage excerpt."
    )
    user_q = f"Passage title: {body.get('title', '')}\n\nExcerpt:\n{excerpt}"
    qs = _ai_json(system_q, user_q, max_tokens=8000)
    body["questions"] = qs.get("questions") or []
    return body


def _save_checkpoint(out_path: Path, draft: dict) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  (checkpoint saved → {out_path})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3)
    parser.add_argument("--reading", type=int, default=2)
    parser.add_argument("--out", required=True)
    parser.add_argument("--resume", action="store_true", help="Continue from existing output file")
    args = parser.parse_args()

    out_path = Path(args.out)
    used: list[str] = []
    vocab_days: list[dict] = []
    readings: list[dict] = []
    start_day = 1

    if args.resume and out_path.is_file():
        existing = json.loads(out_path.read_text(encoding="utf-8"))
        vocab_days = existing.get("vocabulary", {}).get("days") or []
        readings = existing.get("reading", {}).get("passages") or []
        for d in vocab_days:
            for w in d.get("words") or []:
                if w.get("word"):
                    used.append(w["word"])
        start_day = len(vocab_days) + 1
        print(f"Resuming from day {start_day} ({len(vocab_days)} days already in file)")

    for d in range(start_day, args.days + 1):
        print(f"Generating vocabulary day {d}/{args.days}…")
        words = generate_vocab_day(d, used)
        for w in words:
            if w.get("word"):
                used.append(w["word"])
        vocab_days.append({"dayNumber": d, "words": words})
        print(f"  → {len(words)} words total for day {d}")
        _save_checkpoint(
            out_path,
            {
                "className": "EAP047",
                "vocabulary": {"courseTitle": "EAP047 Academic Word Builder (AI draft)", "days": vocab_days},
                "reading": {"passages": readings},
                "note": "Review before import_eap047_self_study_seeds.py --apply",
            },
        )

    start_reading = len(readings) + 1
    for i in range(start_reading, args.reading + 1):
        print(f"Generating reading passage {i}/{args.reading}…")
        readings.append(generate_reading_passage(i))
        _save_checkpoint(
            out_path,
            {
                "className": "EAP047",
                "vocabulary": {"courseTitle": "EAP047 Academic Word Builder (AI draft)", "days": vocab_days},
                "reading": {"passages": readings},
                "note": "Review before import_eap047_self_study_seeds.py --apply",
            },
        )

    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
