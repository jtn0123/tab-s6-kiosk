# Patch O — Fingerprint / UDFPS attempt (SM-T860, Egis ET713)

**Status: DEAD END — kept as documentation so nobody repeats it. Module not installed.**

Full session 2026-08-16. Conclusion first: **the in-display fingerprint sensor cannot work off
Samsung's stock firmware.** Not on this GSI, and — per the XDA One UI 6 and One UI 7 ports for
this exact tablet, both titled "all hardware working *except fingerprint*" — not even on rebuilt
Samsung firmware. The illumination handshake for the optical sensor lives in One UI's proprietary
system layer, which exists nowhere else.

## Hardware

- **Egis ET713**, optical, under-display. `/dev/esfp0`, `type_check = 8`, SPI at 20 MHz.
- Position node `/sys/class/fingerprint/fingerprint/position` = `11.74,0.00,7.50,7.50,...`
  (mm, **panel-native frame**). The panel is mounted rotated (`installOrientation 3`), so this is
  NOT portrait bottom-center — in portrait the sensor sits on a side edge at mid-height,
  "above the Home button" in the tablet's natural landscape orientation.
- Optical means the panel **is the light source**. Samsung's bright green/white glow on press is
  functional illumination, not decoration. No glow → the sensor photographs darkness → timeout.

## What was tried, in order

| Step | Result |
|---|---|
| C3 procedure: `fod_color` Green (`00ff00`) via Treble Settings | prop set, no visible circle ever drawn |
| Enrollment (`android.settings.FINGERPRINT_ENROLL`) | session opens, `Fps state: 1`, times out in 60 s, `acquire: 0` |
| phh "workaround for broken fingerprint" (`persist.sys.phh.samsung_fingerprint=1`) | Samsung TZ service starts polling (`preenroll_flag: 1` @ 1 Hz) — real progress |
| Touch-firmware FOD zone: `echo fod_enable,1 > /sys/class/sec/tsp/cmd` + `set_fod_rect` | all `:OK`; **one** `onAcquired(6, 10001)` reached the HAL — the single furthest point achieved |
| RRO `config_udfps_sensor_props` (this directory) | proper AOSP UDFPS enroll UI appears — and breaks everything, see below |
| `fod_lp_mode,0`, Settings force-stop, screen-timeout extension | no further acquisitions |

## Why the RRO makes things WORSE (the interesting finding)

`udfps-overlay.apk` (buildable with `build.ps1`, installable via `module/`) declares the sensor
as under-display. The framework then shows the real UDFPS enrollment UI with an on-screen target.
Two fatal problems:

1. `InputDispatcher: UdfpsControllerOverlay is stealing input gesture ... from
   com.android.settings` — SystemUI intercepts the touch **before phh's patched Settings**
   (`PHH-Enroll`) sees it, and phh's forwarding is the only path that ever delivered a finger
   event to Samsung's HAL. The overlay disconnects the one wire that worked.
2. `UdfpsHelper: onFingerUp | failed to cast the HIDL to V2_3` — AOSP's UDFPS finger-down/up
   signaling needs `IBiometricsFingerprint@2.3`; Samsung's blob is older. The channel cannot
   exist.

So: pretty UI, structurally dead. Removed with `touch /data/adb/modules/udfps_overlay_t860/remove`
and a reboot.

## The wall

`SDM: HWDeviceDRM ... Fingerprint Indisplay Layer property` exists in the display driver and was
only ever observed being set to **0**. Arming it (= lighting the sensor area for capture) is done
by One UI's biometrics stack during capture. Nothing in AOSP, LineageOS, or phh knows how to do
it for this panel, and the vendor HAL does not do it on its own.

## Cleanup state

Everything reverted: workaround prop back to 0, screen timeout back to 60 s, pointer overlay off,
Magisk module removed. `fod_color` remains `00ff00` (harmless, invisible). The touch-firmware FOD
commands do not survive reboot.
