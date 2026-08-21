# Patch F — Speaker tuning investigation

**Status: RESOLVED — hypothesis disproven. Nothing to apply. Read this before believing the
"GSI breaks the speaker DSP" folklore.**

The complaint that started this: *all four speakers play, but they sounded far better on One UI.*

## The hypothesis (wrong, but worth writing down)

The Tab S6 uses four **Cirrus Logic CS35L41** amplifiers. Each has an **onboard DSP** running
firmware that does speaker protection, bass extension and loudness enhancement, plus per-unit
factory calibration.

Neither community speaker fix touches any of that — both the original
([1987tlz's Magisk module](https://xdaforums.com/t/gsi-4-speaker-fix-for-galaxy-tab-s6.4780990/))
and `tabs6-gsi-fixes.zip` only set **ASPRX1 slot positions**, i.e. which channel goes to which amp.
Routing, not tuning. `phh-spkrot.sh` on the device calls `tinymix` solely on
`"<FL|FR|RL|RR> ASPRX1 Slot Position"`.

So the story looked obvious: routing fixed, amps play, but the DSP that gives them body never
loads. That would sound exactly like "all four work but it's thin."

**It was wrong.**

## What the diagnostic actually found

Full `tinymix` dump — 4242 controls, with real root. Every one of the four amps (RR/RL/FR/FL)
reports the same thing:

| Control | Value | Means |
|---|---|---|
| `DSP Booted` | `On` | DSP core running |
| `DSP1 Preload Switch` | `On` | firmware preloaded |
| `DSP1 Firmware` | `Protection` | the Cirrus protection/tuning firmware **is** the loaded image |
| `DSP1 Protection 400a4 HALO_STATE` | `0x02` | HALO DSP in run state |
| `... HALO_HEARTBEAT` | incrementing | DSP alive, not hung |
| `... cd CSPL_ENABLE` | `1` | Cirrus SPL processing enabled |
| `... cd CAL_STATUS` | `1` | calibration loaded |
| `... cd CAL_R` | `0x2184` | per-unit measured coil resistance |
| `... cd CAL_CHECKSUM` | `0x2185` | matches `CAL_R + 1` — checksum valid |
| `... cd CAL_SET_STATUS` | `2` | calibration **applied** |

Kernel log corroborates the probe path:

```
cs35l41 3-0040..0043: Cirrus Logic CS35L41 (35a40), Revision: A0
cs35l41 3-0040: Prince MFD core probe
cs35l41-cal cs35l41-cal.1.auto: Prince Calibration Driver probe, Dev ID = 35a40
cirrus cirrus_pwr: cirrus_pwr_set_params: global enable = 0, cs35l41_r, target temp = 3700
```

**The hardware tuning and protection DSP is fully operational on the GSI.** `/vendor` is still
Samsung's partition, the firmware blobs load, and calibration is applied per speaker.

## So what is actually missing

Samsung's **software** effects layer — Dolby Atmos / SoundAlive / UHQ upscaling. That is a
proprietary APK + audio-effects stack living in One UI's `/system`, which a GSI by definition
replaces. It is not a mixer setting, so no amount of `tinymix` poking brings it back.

That makes this a software-EQ problem, which is **[patch E](../E-audio-dsp/)** — and with real root
now available, the full rootful JamesDSP applies system-wide (convolver / impulse responses,
dynamic bass), not just the rootless per-app variant.

## The gain trap this avoided

**Do not raise amp gain blind.** The original plan was diagnose-first precisely because speaker
protection exists to stop these drivers being physically destroyed by overdriving. Had the DSP
genuinely been unloaded, raising gain would have been driving unprotected drivers — and unlike a
bad config file, a blown voice coil is not recoverable with TWRP.

The diagnostic showed the protection firmware **is** running, so the amps are already being driven
to their safe limit. There was never gain headroom to reclaim here. Diagnosing first turned a
tempting, plausible, hardware-damaging change into a five-minute read.

## One loose end

All four amps report `Boost Enable = Disabled`. The CS35L41's boost converter raises supply voltage
for more output headroom, and stock may well have run it enabled.

Deliberately **not** changed. It interacts directly with the thermal/excursion limits the protection
firmware enforces, and the payoff (some loudness) does not justify the risk while an untried
software EQ is sitting right there. Revisit only if patch E alone doesn't close the gap, and only
with protection confirmed still engaged.

## Reproducing

```bash
powershell -File diagnose.ps1 > speaker-report.txt
```

Read-only — dumps the mixer, checks `/vendor` firmware, greps the kernel log for the load path,
and records calibration state. Needs root; `tinymix` returns "Failed to open mixer" as plain shell.

Note the kernel log is reachable **without** root via `logcat -b kernel` (shell is in the `log`
group), which is enough to confirm the driver probe — handy when root is unavailable.
