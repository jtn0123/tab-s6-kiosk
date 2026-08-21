# Patch D — usage mode (panel vs tablet)

```bash
powershell -File apply.ps1 -Mode panel      # mounted dashboard
powershell -File apply.ps1 -Mode tablet     # handheld video player
powershell -File revert.ps1                 # restore pre-patch values
```

No root. Values live in `/data`, so they survive GSI updates. `apply.ps1` backs up the original
values to `backup.json` on first run, so `revert.ps1` restores what was actually there.

## You may not need this at all

**Inky OLED already handles the important half.** The app holds `FLAG_KEEP_SCREEN_ON` while it is
in the foreground and is locked to landscape in its manifest. So:

- Dashboard showing → screen stays on, landscape
- Switch to a video app → normal sleep timeout and free rotation return automatically

That is the behaviour you want from a device doing both jobs, and it needs **no global settings**.

Setting `stay_on_while_plugged_in` globally is actively worse: it forces the screen on inside
*every* app, including video, and on an AMOLED that is exactly how you get burn-in.

**Recommendation: skip this patch unless you have a specific reason.** It exists for the case where
you want panel behaviour from something other than Inky OLED.

## What each mode sets

| Setting | `panel` | `tablet` |
|---|---|---|
| `stay_on_while_plugged_in` | `3` (AC\|USB) | `0` |
| `screen_off_timeout` | 30 min | 10 min |
| `accelerometer_rotation` | `0` (locked) | `1` (free) |
| `user_rotation` | `1` (90°) | untouched |
| `screensaver_enabled` | `0` | `0` |

Change `user_rotation` to match how the tablet is physically mounted: `0`=0° `1`=90° `2`=180° `3`=270°.

## Related

- Patch I — burn-in. Directly at odds with permanent stay-awake; read both.
- Patch J — video playback. Rotation lock should be **off** if the tablet gets picked up.
