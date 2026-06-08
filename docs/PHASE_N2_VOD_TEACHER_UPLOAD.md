# Phase N2 — Teacher VOD direct upload (Web)

**Parent:** [`TENCENT_VOD_SETUP.md`](TENCENT_VOD_SETUP.md)

## Delivered

| Piece | Detail |
|-------|--------|
| `generate_client_upload_signature()` | vod-js-sdk-v6 upload signature |
| `POST .../vod/register` | Create lesson row with `vod_file_id`, `vod_status=transcoding` |
| `teacher-recorded.js` | Auto VOD for video when enabled; local for audio |
| List badges | Transcoding / VOD ready / failed |

## UAT (after VOD + HTTPS)

1. `teacher1` → Recorded lessons → see blue VOD banner
2. Upload MP4 → progress % → list shows **Transcoding**
3. After webhook → **VOD ready** → publish → `student1` plays in `player.html`

## Fallback

`EAP_VOD_ENABLED=0` → 100% local upload (unchanged).
