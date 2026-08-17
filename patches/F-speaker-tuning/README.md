# Patch F — Speaker tuning investigation

**Status: DIAGNOSTIC ONLY. Nothing to apply yet.**

This is the one that targets the actual complaint: *all four speakers play, but they sounded
far better on One UI.*

## The hypothesis

The Tab S6 uses four **Cirrus Logic CS35L41** amplifiers. These are not dumb amps — each has an
**onboard DSP** that runs firmware doing:

- **Speaker protection** (excursion/thermal limiting)
- **Bass extension and loudness enhancement** — this is what makes small drivers sound big
- Per-unit **calibration** data measured at the factory

On stock One UI, Samsung loads its calibration + AKG-derived tuning into that DSP, then layers
Dolby Atmos on top. The result is the "amazing" sound.

**Neither speaker fix for this device touches any of that.** Both the original
([1987tlz's Magisk module](https://xdaforums.com/t/gsi-4-speaker-fix-for-galaxy-tab-s6.4780990/))
and the newer `tabs6-gsi-fixes.zip` only set **ASPRX1 slot positions** — i.e. *which channel goes
to which amp*. Routing, not tuning. Confirmed by reading `phh-spkrot.sh` off this tablet: it calls
`tinymix` solely on `"<FL|FR|RL|RR> ASPRX1 Slot Position"`.

So the plausible story is: routing is fixed, the amps play, but the DSP that gives them body is
either not loaded or not enabled. That would sound exactly like "all four work but it's thin."

**Encouraging fact:** `/vendor` is still Samsung's partition — untouched by the GSI. The Cirrus
firmware and calibration blobs are almost certainly still physically present on the device. The
question is purely whether anything loads and enables them.

## What to run

```bash
powershell -File diagnose.ps1 > speaker-report.txt
```

Needs root (Developer options -> Root access -> "ADB only"). `tinymix` returns
"Failed to open mixer" as the plain shell user — this was already hit during verification.

**The script only reads. It writes nothing.** It dumps the full mixer control list, checks whether
Cirrus firmware exists in `/vendor`, greps `dmesg` for whether the kernel actually loaded it,
looks for calibration data, and records current gain/DSP control values.

## ⚠️ Why this is diagnose-first, not tweak-first

**Do not raise amp gain blind.** Speaker protection exists because these drivers can be physically
damaged by overdriving them. If the protection DSP is *not* running and gain gets raised anyway,
distortion or permanent driver damage is a real possibility — and unlike a bad config file, that
is not recoverable with TWRP.

So: read the state, work out whether the DSP is loaded, and only then decide.

## Realistic expectations

- **Dolby Atmos is not coming back.** It is a One UI component, same category as HDR.
- **If the Cirrus DSP is genuinely not loaded, enabling it could be a large improvement** — this is
  the single most likely explanation for the drop in quality, and the most promising lead.
- **If the DSP *is* already loaded**, then the gap is Samsung's tuning/Atmos layer, and the
  practical answer becomes EQ compensation via Patch E (RootlessJamesDSP), which covers SmartTube
  but not Brave.

## Next step

Run the diagnostic and send back `speaker-report.txt`. The mixer dump will show whether there are
DSP-enable, tuning, or gain controls sitting at defaults — and that determines whether there is a
safe, targeted change worth making.
