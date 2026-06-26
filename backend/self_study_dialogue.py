"""Shared dialogue turn parsing and male/female voice assignment for listening TTS."""
from __future__ import annotations

import re
from typing import Any

MALE_SPEAKER_HINTS = frozenset(
    {
        "john",
        "mike",
        "tom",
        "james",
        "david",
        "mark",
        "peter",
        "paul",
        "daniel",
        "michael",
        "robert",
        "william",
        "tutor",
        "professor",
        "lecturer",
        "dr ",
        "mr ",
    }
)
FEMALE_SPEAKER_HINTS = frozenset(
    {
        "sarah",
        "emma",
        "lisa",
        "mary",
        "anna",
        "sophie",
        "lucy",
        "helen",
        "jane",
        "emily",
        "ms ",
        "mrs ",
    }
)


def infer_gender_from_speaker(speaker: str) -> str:
    lower = f" {speaker.lower()} "
    for hint in MALE_SPEAKER_HINTS:
        if hint in lower:
            return "male"
    for hint in FEMALE_SPEAKER_HINTS:
        if hint in lower:
            return "female"
    return ""


def segment_rows_from_raw(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for seg in raw:
        if not isinstance(seg, dict):
            continue
        text = str(seg.get("text") or seg.get("line") or "").strip()
        if not text:
            continue
        gender = str(seg.get("gender") or "").lower()
        rows.append(
            {
                "speaker": str(seg.get("speaker") or "Speaker").strip() or "Speaker",
                "gender": gender if gender in {"male", "female"} else "",
                "text": text,
            }
        )
    return rows


def dialogue_segments_from_script(script: str) -> list[dict[str, Any]]:
    dialogue_segs: list[dict[str, Any]] = []
    for line in re.split(r"\n+", script):
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^([A-Za-z][A-Za-z\s.'0-9]{0,40}):\s*(.+)$", line)
        if match:
            dialogue_segs.append(
                {
                    "speaker": match.group(1).strip(),
                    "gender": "",
                    "text": match.group(2).strip(),
                }
            )
        else:
            dialogue_segs.append({"speaker": "Narrator", "gender": "female", "text": line})
    return dialogue_segs


def assign_dialogue_genders(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map distinct speakers to male/female voices (IELTS Part 3-style dialogue)."""
    cleaned: list[dict[str, Any]] = []
    for seg in segments:
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        speaker = str(seg.get("speaker") or "Speaker").strip() or "Speaker"
        gender = str(seg.get("gender") or "").lower()
        if gender not in {"male", "female"}:
            gender = infer_gender_from_speaker(speaker)
        cleaned.append({"speaker": speaker, "gender": gender, "text": text})

    speakers: list[str] = []
    for row in cleaned:
        if row["speaker"] not in speakers:
            speakers.append(row["speaker"])

    if len(speakers) >= 2:
        mapping: dict[str, str] = {}
        for sp in speakers[:2]:
            inferred = next(
                (str(r["gender"]) for r in cleaned if r["speaker"] == sp and r["gender"] in {"male", "female"}),
                "",
            )
            if inferred in {"male", "female"}:
                mapping[sp] = inferred
        if speakers[0] not in mapping and speakers[1] not in mapping:
            mapping[speakers[0]] = "male"
            mapping[speakers[1]] = "female"
        elif speakers[0] in mapping and speakers[1] not in mapping:
            mapping[speakers[1]] = "female" if mapping[speakers[0]] == "male" else "male"
        elif speakers[1] in mapping and speakers[0] not in mapping:
            mapping[speakers[0]] = "female" if mapping[speakers[1]] == "male" else "male"
        elif mapping.get(speakers[0]) == mapping.get(speakers[1]):
            mapping[speakers[1]] = "female" if mapping.get(speakers[0]) == "male" else "male"
        for i, sp in enumerate(speakers[2:], start=2):
            if sp not in mapping:
                mapping[sp] = "male" if i % 2 == 0 else "female"
        for row in cleaned:
            row["gender"] = mapping.get(row["speaker"], "female")
    else:
        for row in cleaned:
            if row["gender"] not in {"male", "female"}:
                row["gender"] = "female"
    return cleaned


def alternating_sentence_turns(script: str) -> list[dict[str, Any]]:
    """Split prose dialogue into alternating male/female turns when speaker labels are missing."""
    compact = re.sub(r"\s+", " ", script).strip()
    if not compact:
        return []
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", compact) if s.strip()]
    if len(sentences) < 2:
        return [{"speaker": "Sarah", "gender": "female", "text": compact}]
    turns: list[dict[str, Any]] = []
    for i, sentence in enumerate(sentences):
        gender = "male" if i % 2 == 0 else "female"
        speaker = "Tom" if gender == "male" else "Sarah"
        turns.append({"speaker": speaker, "gender": gender, "text": sentence})
    return turns


def dialogue_speaker_count(segments: list[dict[str, Any]]) -> int:
    return len({str(seg.get("speaker") or "Speaker").strip() or "Speaker" for seg in segments})


def enforce_placement_listening_turns(listening: dict[str, Any]) -> list[dict[str, Any]]:
    segment_rows = segment_rows_from_raw(listening.get("segments"))
    if dialogue_speaker_count(segment_rows) < 2:
        from_script = dialogue_segments_from_script(str(listening.get("script_en") or ""))
        if dialogue_speaker_count(from_script) >= 2:
            segment_rows = from_script
    if not segment_rows:
        segment_rows = dialogue_segments_from_script(str(listening.get("script_en") or ""))
    segment_rows = assign_dialogue_genders(segment_rows)

    if dialogue_speaker_count(segment_rows) >= 2 and len(segment_rows) >= 2:
        return segment_rows

    script = str(listening.get("script_en") or "").strip()
    if script:
        alt = alternating_sentence_turns(script)
        if len(alt) >= 2:
            return alt
    return segment_rows


def listening_turns_from_content(content: dict[str, Any]) -> list[dict[str, Any]]:
    """Build gender-assigned turn rows from Channel B listening item content."""
    part_type = str(content.get("partType") or "").upper()
    rows = segment_rows_from_raw(content.get("turns") or [])

    if part_type == "P3" or len(rows) >= 2:
        if dialogue_speaker_count(rows) < 2:
            from_script = dialogue_segments_from_script(str(content.get("scriptEn") or ""))
            if dialogue_speaker_count(from_script) >= 2:
                rows = from_script
        if not rows:
            rows = dialogue_segments_from_script(str(content.get("scriptEn") or ""))
        rows = assign_dialogue_genders(rows)
        if dialogue_speaker_count(rows) >= 2 and len(rows) >= 2:
            return rows
        script = str(content.get("scriptEn") or "").strip()
        if script:
            alt = alternating_sentence_turns(script)
            if len(alt) >= 2:
                return alt
        return rows

    paragraphs = [str(p).strip() for p in (content.get("paragraphs") or []) if str(p).strip()]
    if paragraphs:
        return [{"speaker": "Lecturer", "gender": "female", "text": p} for p in paragraphs]
    script = str(content.get("scriptEn") or "").strip()
    if script:
        return [{"speaker": "Lecturer", "gender": "female", "text": script}]
    return []
