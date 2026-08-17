# Patch J — Video playback

For when the tablet is being a video player rather than a dashboard. These are real decode and DRM
limitations, not preferences.

## J1 — SmartTube: force VP9, cap 1080p60. **Not optional.**

The Snapdragon 855 has **no AV1 hardware decode.** YouTube increasingly serves AV1. Left alone,
the tablet falls back to *software* decode — stutter, heat, and battery drain on exactly the
content you most want to watch.

In SmartTube: **Settings → General → Video codec → prefer VP9** (and disable AV1), then
**Settings → General → Video quality → cap at 1080p60**.

1080p60 on a 10.5" panel is already beyond what the screen resolves at normal viewing distance,
so the cap costs nothing visible and removes the decode cliff.

## J2 — Widevine is L3. This is permanent.

Unlocking the bootloader dropped Widevine **L1 → L3**. Consequence for a video player:

| Service | Result |
|---|---|
| YouTube / SmartTube | **Unaffected** — no Widevine requirement |
| Local files (Plex, VLC, Jellyfin) | **Unaffected** |
| Netflix, Disney+, Prime Video | **Capped to 480p/SD**, or refuses to play |

**Not fixable.** L1 requires a locked bootloader and intact keybox. Restoring stock firmware does
not restore it — the Knox fuse is blown. This was accepted when the bootloader was unlocked.

If HD streaming from those services matters, use another device for them. Everything else plays fine.

## J3 — Check what actually decodes in hardware

Run to see the real codec situation on the device:

```bash
adb shell dumpsys media.player | grep -i -A2 "codec"
adb shell cmd media.player list-codecs 2>/dev/null
```

Look for hardware (`c2.qti.*` / `OMX.qcom.*`) versus software (`c2.android.*`) entries for
`video/av01` (AV1), `video/x-vnd.on2.vp9` (VP9), and `video/hevc`. Anything AV1 will be
`c2.android.*` — software only.

## J4 — Audio during playback

The four speakers are routed correctly but likely **not tuned** — see patch F. That matters more
for video than for a dashboard. Patch E (RootlessJamesDSP) can compensate with EQ, and importantly
**it does process SmartTube**, though not Brave.

## Related

- Patch A restores HDR headroom — relevant here, since HDR video was the thing missing.
- Patch F investigates why the speakers sound thinner than stock.
- Patch D's rotation lock should be **off** if the tablet gets picked up and used handheld.
