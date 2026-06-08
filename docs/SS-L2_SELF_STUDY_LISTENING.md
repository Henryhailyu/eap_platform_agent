# SS-L2 — Listening notes compare (Web)

**Parent:** [`SS-L1_SELF_STUDY_LISTENING.md`](SS-L1_SELF_STUDY_LISTENING.md) · [`SELF_STUDY_LISTENING.md`](SELF_STUDY_LISTENING.md)

## Delivered

### Backend (`self_study_listening.py`)

| Feature | Purpose |
|---------|---------|
| `keyPointsEn` / `keyPointsZh` on seed items | Checklist labels for compare |
| `compare_listening_notes()` | Token overlap match (EN + ZH labels) |
| `_upgrade_listening_key_points()` | Patches existing EAP047 DB rows on migrate |
| Coach API + practice submit | Returns `comparison` with `coveragePct`, `points[]` |

**Fallback:** If `keyPoints` absent, splits exemplar notes by line.

### Student API (coach payload additions)

```json
{
  "coach": {
    "exemplarNotesEn": "...",
    "keyPointsEn": ["..."],
    "comparison": {
      "coveragePct": 67,
      "matchedCount": 2,
      "totalCount": 3,
      "points": [{ "id": 0, "labelEn": "...", "labelZh": "...", "matched": true }]
    }
  }
}
```

### Frontend

- `student-self-study-listening-ui.js` — coverage bar + key-point checklist (matched/missed)
- Side-by-side notes grid retained from SS-L1

## UAT

1. `student1` → Listening → save notes mentioning 2+ key ideas → complete practice
2. **Notes coach** tab → coverage % + checklist + exemplar side-by-side
3. Lighthouse: restart container (migrate runs on boot) → key points appear for EAP047 items

## Next

- **SS-App** push / streak (19:00 reminder)
- AI-generated key points when manager uploads new listening items
- Line-level diff highlight (optional polish)
