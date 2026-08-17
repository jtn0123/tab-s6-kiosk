# Patch B — Haptic strength

**Independent of every other patch.** Touches only `/vendor/build.prop`.

## What it does

The Tab S6's vibration motor has no amplitude control, so "strength" is purely how long each
buzz lasts. The AIDL vibrator HAL added by `tabs6-gsi-fixes.zip` exposes this as a property.

Source: the fixes-zip author's own notes on the XDA thread
(<https://xdaforums.com/t/fix-gsi-sm-t860-t865-galaxy-tab-s6-storage-all-4-speakers-rotation-aware-and-haptics-on-android-16-gsis.4796316/>)

## Current state on this tablet

Haptics are **already working** — verified 2026-08-16 via the vibration history, which showed
real amplitude ramps driven by SystemUI touches:

```
effect | finished | duration: 75ms | usage: TOUCH | com.android.systemui
played: [Step=10ms(amp=0.04), Step=20ms(amp=0.12), Step=20ms(amp=0.20), Step=10ms(amp=0.04)]
```

So this patch is **tuning only**, not a fix. Skip it unless the default feel is wrong.

## Apply

Requires root (Developer options -> Root access -> "ADB only", then `adb root`).

```bash
adb root
adb remount
adb shell "echo 'ro.vendor.vibrator.sysfs.min_ms=50' >> /vendor/build.prop"
adb reboot
```

## Values

| Value | Feel |
|---|---|
| 35  | subtle |
| 50  | default, balanced |
| 70  | strong |
| 90+ | quite buzzy, may feel sloppy on key repeat |

## Revert

Remove the line from `/vendor/build.prop` and reboot. If the file is damaged, reflashing
`tabs6-gsi-fixes.zip` does not restore build.prop — but reflashing the GSI does.

## Note on GSI updates

A GSI update replaces `/vendor`, wiping this. Re-apply after each update, same as the fixes zip.
