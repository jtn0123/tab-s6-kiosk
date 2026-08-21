# Patch C — Treble Settings toggles

**Independent of every other patch.** Pure runtime settings, no files written, instantly
reversible, survives GSI updates (stored in `/data`).

**Do these FIRST** — they are free, and two of them address things the turnover doc got wrong.

## Opening Treble Settings

It has **no launcher icon** on this build. Launch it directly:

```bash
adb shell am start -n me.phh.treble.app/.TopLevelSettingsActivity
```

(alternate entry point: `me.phh.treble.app/.SettingsActivity`)

## C1 — Brightness range — ALREADY APPLIED, and it worked

**Treble Settings -> Samsung features -> "extend brightness range"**

Applied 2026-08-16. Before: `screen_brightness = 255` (pegged at max) and still dim — a
HAL-level cap. After: Justin reported "much better", and the value sits at 84/255, meaning
the scale was remapped with roughly 3x headroom remaining.

## C2 — Audio toggles — NOT YET TRIED, but expectations should be LOW

- **Treble Settings -> Qualcomm -> alternate audio policy**
- **Treble Settings -> Samsung -> alternate audio + stereo**

**Correction to an earlier note in this project.** These were previously described as "the primary
lever for Tab S6 audio". That was overstated. What they actually do:

- *alternate audio policy* — primarily fixes **Bluetooth voice calls**, and the headphone jack on
  some devices
- *stereo audio mode* — paired with the above for Bluetooth/audio issues

The SM-T860 is **Wi-Fi only** (no voice calls) and its **four speakers already work** —
`tabs6-gsi-fixes.zip` drives all four CS35L41 amps and `phh-spkrot` is confirmed running. So these
toggles are **unlikely to change speaker quality**. Flip them if Bluetooth speakers misbehave;
otherwise do not expect much.

For actual audio *quality* improvements, see **Patch E (RootlessJamesDSP)**. Samsung's Dolby Atmos
/ UHQ / audio tuning are One UI features and are not recoverable on a GSI.

Source: <https://xdaforums.com/t/how-to-configure-a-treble-gsi-properly.4564191/>

## C3 — Fingerprint — NOT YET TRIED. TURNOVER.md is probably WRONG.

TURNOVER.md states "Fingerprint will never work on the GSI — known, accepted."

**The Tab S6 has an IN-DISPLAY OPTICAL sensor** (confirmed from device specs). Optical sensors
work by illuminating the finger *with the screen* and photographing the reflection. If the GSI
drives the wrong illumination colour, the sensor physically cannot read — which is the actual
failure mechanism, and there is a setting for exactly this.

**Procedure (order matters):**

1. **Treble Settings -> Misc Features -> "Under-display fp color"**
   (near the bottom of the "Other" category). Options: **Green / Cyan / White**.
2. Set it to **Green** first — several ROMs only permit fingerprint *enrollment* while green.
3. **Delete all existing fingerprints**, then re-register them. Mandatory after any colour change.
4. Switch back to **White** — Samsung stock's colour — for day-to-day unlocking.
5. Only if it still fails:
   **Samsung features -> Workarounds -> "Enable workaround for broken fingerprint sensor"**
6. Last resort: **Misc -> "Treat virtual sensors as real"**, then reboot.

Sources:
- <https://xdaforums.com/t/fix-gsi-in-screen-fingerprint-sensor-not-working.4531397/>

Irrelevant for a wall panel, but cheap to settle either way. **Worth correcting in PROJECT.md.**

## Revert

Toggle off. Nothing persists outside the app's own settings.
