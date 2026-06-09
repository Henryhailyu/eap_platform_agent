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
WORDS_PER_DAY = 30
BATCH_SIZE = 10
MAX_VOCAB_BATCHES = 9
GAP_FILL_BATCHES = 30
GAP_FILL_ROUNDS = 4

DAY_THEMES = (
    "research methodology and academic writing",
    "environment, climate and sustainability",
    "economics, business and global markets",
    "technology, computing and innovation",
    "health, medicine and public policy",
    "education, psychology and learning sciences",
    "law, governance and social justice",
    "culture, media and communication",
    "statistics, data and evidence",
    "urban planning and infrastructure",
)

FILL_NICHES = (
    "archaeology, anthropology and heritage studies",
    "astrophysics, geology and earth sciences",
    "marine biology and oceanography",
    "linguistics, phonetics and semantics",
    "pharmacology and biomedical engineering",
    "agriculture, forestry and food science",
    "architecture, design and spatial theory",
    "philosophy, ethics and epistemology",
    "microeconometrics and actuarial science",
    "cybersecurity, cryptography and networks",
)


def _unique_word_list(words: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in words:
        token = str(raw or "").strip()
        if not token:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(token)
    return out


def _format_avoid_list(words: list[str], *, max_chars: int = 14000) -> str:
    tokens = _unique_word_list(words)
    if not tokens:
        return "(none yet)"
    text = ", ".join(tokens)
    if len(text) <= max_chars:
        return text
    head = ", ".join(tokens[:400])
    tail = ", ".join(tokens[-200:])
    return (
        f"{head}, …, {tail} "
        f"(full list: {len(tokens)} words already used — every one must be avoided)"
    )


def _used_token_set(words: list[str]) -> set[str]:
    return {w.strip().lower() for w in words if str(w or "").strip()}


def _ai_json(system: str, user: str, *, max_tokens: int = 8000, temperature: float = 0.35) -> dict:
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
                temperature=temperature,
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
    theme: str,
    temperature: float = 0.35,
    aggressive: bool = False,
) -> list[dict]:
    system = (
        "You generate academic English vocabulary for EAP047 (IELTS ~6.5). "
        "Return ONLY compact JSON: {\"words\": [{\"word\", \"coreMeaning\", \"methodPrimary\", "
        "\"prefix\", \"root\", \"suffix\", \"mnemonic\"}]}. "
        "methodPrimary is affix, mnemonic, or mixed. Use empty string for unused affix fields. "
        "One short coreMeaning per word (under 12 words). No phonetic, no example sentences. "
        f"Exactly {count} unique words not in the avoid list."
    )
    if aggressive:
        system += (
            " Use rare C1-C2 academic terms and discipline-specific jargon. "
            "Do NOT reuse common IELTS headwords."
        )
    avoid = _format_avoid_list(used_words)
    user = (
        f"Day {day_number}, batch {batch_no}. Theme: {theme}. "
        f"Generate {count} NEW academic words on this theme. "
        f"Every word must differ from ALL words in this avoid list:\n{avoid}"
    )
    if aggressive:
        user += f"\nNeed {count} genuinely novel words; prior batches returned too many duplicates."
    payload = _ai_json(system, user, max_tokens=3500, temperature=temperature)
    words = payload.get("words") or []
    if len(words) < count:
        print(f"    warning: batch returned {len(words)} words (wanted {count})", file=sys.stderr)
    return words


def _normalize_word(raw: dict) -> dict:
    """Map flat AI fields to SS-V1 word card shape."""
    return {
        "word": raw.get("word") or "",
        "phonetic": raw.get("phonetic") or "",
        "coreMeaning": raw.get("coreMeaning") or raw.get("core") or "",
        "methodPrimary": raw.get("methodPrimary") or raw.get("method") or "affix",
        "affix": {
            "prefix": raw.get("prefix") or (raw.get("affix") or {}).get("prefix") or "",
            "root": raw.get("root") or (raw.get("affix") or {}).get("root") or "",
            "suffix": raw.get("suffix") or (raw.get("affix") or {}).get("suffix") or "",
            "gloss": raw.get("coreMeaning") or "",
        },
        "mnemonic": raw.get("mnemonic"),
        "examples": raw.get("examples")
        or ([raw["example"]] if raw.get("example") else [f"Scholars study how {raw.get('word', 'this term')} affects outcomes."]),
    }


def _merge_vocab_batch(
    batch: list[dict],
    words: list[dict],
    used_set: set[str],
) -> tuple[int, int, int]:
    added = dupes = empty = 0
    day_tokens = {str(w.get("word") or "").strip().lower() for w in words}
    for raw in batch:
        entry = _normalize_word(raw)
        token = str(entry.get("word") or "").strip().lower()
        if not token:
            empty += 1
            continue
        if token in used_set or token in day_tokens:
            dupes += 1
            continue
        words.append(entry)
        day_tokens.add(token)
        used_set.add(token)
        added += 1
    return added, dupes, empty


def _run_vocab_batches(
    day_number: int,
    used_words: list[str],
    words: list[dict],
    *,
    max_batches: int,
    batch_size: int,
    base_temperature: float = 0.35,
    aggressive: bool = False,
    theme: str | None = None,
) -> None:
    theme = theme or DAY_THEMES[(day_number - 1) % len(DAY_THEMES)]
    used_set = _used_token_set(used_words)
    batch_no = 0
    zero_streak = 0

    while len(words) < WORDS_PER_DAY and batch_no < max_batches:
        batch_no += 1
        need = min(batch_size, WORDS_PER_DAY - len(words))
        if zero_streak >= 2:
            need = min(5, need)
        temp = min(base_temperature + zero_streak * 0.1, 0.92)
        print(f"    batch {batch_no} ({need} needed, {len(words)}/{WORDS_PER_DAY} so far)…")
        avoid = used_words + [str(w.get("word") or "") for w in words]
        batch = generate_vocab_batch(
            day_number,
            batch_no,
            count=need,
            used_words=avoid,
            theme=theme,
            temperature=temp,
            aggressive=aggressive or zero_streak >= 2,
        )
        added, dupes, empty = _merge_vocab_batch(batch, words, used_set)
        if dupes or empty:
            print(f"    skipped {dupes} duplicate(s), {empty} empty")
        if added == 0:
            zero_streak += 1
            print(f"    warning: batch {batch_no} added 0 words — retrying…", file=sys.stderr)
        else:
            zero_streak = 0


def generate_vocab_day(day_number: int, used_words: list[str]) -> list[dict]:
    """30 words/day; extra batches top up when AI repeats earlier words."""
    words: list[dict] = []
    max_batches = min(MAX_VOCAB_BATCHES + day_number // 5, 18)
    _run_vocab_batches(
        day_number, used_words, words,
        max_batches=max_batches, batch_size=BATCH_SIZE,
    )
    if len(words) < WORDS_PER_DAY:
        print(
            f"    warning: day {day_number} only got {len(words)}/{WORDS_PER_DAY} words",
            file=sys.stderr,
        )
    return words[:WORDS_PER_DAY]


def _rebuild_used_from_days(vocab_days: list[dict]) -> list[str]:
    used: list[str] = []
    for day_entry in vocab_days:
        for w in day_entry.get("words") or []:
            if w.get("word"):
                used.append(w["word"])
    return used


def _short_vocab_days(vocab_days: list[dict]) -> list[dict]:
    return [d for d in vocab_days if len(d.get("words") or []) < WORDS_PER_DAY]


def fill_short_vocab_days(
    vocab_days: list[dict],
    *,
    out_path: Path,
    readings: list[dict],
) -> bool:
    """Top up days below 30 words. Returns True when every day is complete."""
    for round_no in range(1, GAP_FILL_ROUNDS + 1):
        short = _short_vocab_days(vocab_days)
        if not short:
            return True
        print(f"Gap-fill round {round_no}/{GAP_FILL_ROUNDS}: {len(short)} day(s) below {WORDS_PER_DAY}")
        progress = False
        for day_entry in short:
            day_num = day_entry["dayNumber"]
            words = list(day_entry.get("words") or [])
            before = len(words)
            niche = FILL_NICHES[(day_num + round_no - 2) % len(FILL_NICHES)]
            print(f"  day {day_num}: {before}/{WORDS_PER_DAY} — niche: {niche}")
            used = _rebuild_used_from_days(vocab_days)
            _run_vocab_batches(
                day_num, used, words,
                max_batches=GAP_FILL_BATCHES,
                batch_size=5,
                base_temperature=0.55,
                aggressive=True,
                theme=niche,
            )
            day_entry["words"] = words[:WORDS_PER_DAY]
            after = len(day_entry["words"])
            print(f"    → {before} → {after} words")
            if after > before:
                progress = True
            _save_checkpoint(
                out_path,
                {
                    "className": "EAP047",
                    "vocabulary": {"courseTitle": "EAP047 Academic Word Builder (AI draft)", "days": vocab_days},
                    "reading": {"passages": readings},
                    "note": "Review before import_eap047_self_study_seeds.py --apply",
                },
            )
        if not progress:
            print("Gap-fill stalled — try again later or edit JSON manually", file=sys.stderr)
            break
    return not _short_vocab_days(vocab_days)


def _print_vocab_summary(vocab_days: list[dict]) -> None:
    total = sum(len(d.get("words") or []) for d in vocab_days)
    short = [d["dayNumber"] for d in _short_vocab_days(vocab_days)]
    print(f"Vocabulary summary: {total} words across {len(vocab_days)} days (target {WORDS_PER_DAY * len(vocab_days)})")
    if short:
        print(f"  INCOMPLETE days ({len(short)}): {short}", file=sys.stderr)
    else:
        print("  All days have 30 words — ready for import")


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
    parser.add_argument(
        "--regen-vocab",
        action="store_true",
        help="Regenerate vocabulary from day 1 (keeps reading passages if resuming)",
    )
    parser.add_argument(
        "--fill-vocab-gaps",
        action="store_true",
        help="Only top up days with fewer than 30 words (keeps reading passages)",
    )
    args = parser.parse_args()

    out_path = Path(args.out)
    used: list[str] = []
    vocab_days: list[dict] = []
    readings: list[dict] = []
    start_day = 1

    if args.fill_vocab_gaps:
        if not out_path.is_file():
            raise SystemExit(f"No draft at {out_path} — run full generation first")
        existing = json.loads(out_path.read_text(encoding="utf-8"))
        vocab_days = existing.get("vocabulary", {}).get("days") or []
        readings = existing.get("reading", {}).get("passages") or []
        if not vocab_days:
            raise SystemExit("Draft has no vocabulary days")
        _print_vocab_summary(vocab_days)
        complete = fill_short_vocab_days(vocab_days, out_path=out_path, readings=readings)
        _print_vocab_summary(vocab_days)
        print(f"Wrote {out_path}")
        return 0 if complete else 1

    if args.resume and out_path.is_file():
        existing = json.loads(out_path.read_text(encoding="utf-8"))
        readings = existing.get("reading", {}).get("passages") or []
        if args.regen_vocab:
            print("Regenerating vocabulary from day 1 (keeping existing reading passages)")
        else:
            vocab_days = existing.get("vocabulary", {}).get("days") or []
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

    if vocab_days and _short_vocab_days(vocab_days):
        print("Running automatic gap-fill for incomplete days…")
        fill_short_vocab_days(vocab_days, out_path=out_path, readings=readings)
    _print_vocab_summary(vocab_days)

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
