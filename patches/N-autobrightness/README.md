# Patch N — Adaptive brightness (runtime resource overlay)

**Status: BUILT and INSTALLED. The overlay works. Whether adaptive brightness is *usable* depends
on a sensor test that needs a human — see "The unresolved half".**

⚠️ **Leave adaptive brightness OFF until you have run that test.** If the sensor really is dead,
turning it on pins the screen to ~2.7% brightness — far worse than manual.

## The problem

A wall panel that does not dim at night is both annoying and an OLED burn-in accelerant. But
adaptive brightness was missing, and the toggle did nothing.

## Diagnosis

The hardware is present and the framework already has everything it needs:

- **Sensor exists**: `veml3328 Ambient Light Sensor` (Vishay Capella), `android.sensor.light`
- **Curve exists**: the framework carries a full lux→nits mapping
  (`mBrightnessLevelsNits = [10.0 … 500.0]` against a 30-point lux map)
- **`mDdcAutoBrightnessAvailable = true`**

One thing blocked it:

```
mAutoBrightnessAvailable = false
```

That comes from the framework resource `config_automatic_brightness_available`, which the GSI ships
as `false` because a generic image cannot assume a light sensor exists.

Proof it was inert rather than merely off — with `screen_brightness_mode=1`:

```
mUseAutoBrightness=true          <- setting accepted
mBrightnessReason=manual         <- but the controller never ran
mAmbientLux=-1.0
```

## The fix

A **runtime resource overlay** targeting the `android` package, flipping that single boolean. It is
built with the SDK build-tools only (aapt2 → zipalign → apksigner — no Gradle, no network) and
installed into `/product/overlay` by a Magisk module, since framework overlays must be
"preinstalled" and cannot be sideloaded.

```bash
powershell -File build.ps1          # produces autobrightness-overlay.apk (~8.5 KB)
```

Then package it as a Magisk module with the APK at
`system/product/overlay/autobrightness-overlay.apk` and reboot.

### Verified working

```
$ cmd overlay list android | grep autobright
[x] com.tabs6.autobrightness.overlay          <- enabled

$ dumpsys display | grep mAutoBrightnessAvailable
mAutoBrightnessAvailable= true                 <- was false

$ settings put system screen_brightness_mode 1
$ dumpsys display | grep mBrightnessReason
mBrightnessReason=automatic [ dim ]            <- was manual
```

The overlay does exactly what it was built to do: the resource flipped, and the auto-brightness
controller now runs and subscribes to the light sensor at a 200 ms sampling period.

## The unresolved half — the sensor reports nothing

With the controller running, the sensor never produces a usable reading:

```
mAmbientLux=-1.0                        <- framework has no valid sample
mScreenAutoBrightness=0.027559055       <- so it computes near-minimum brightness

$ dumpsys sensorservice
veml3328 Ambient Light Sensor: last 50 events
     1 (ts=68.359581812) 0.00, 0.00, 0.00,     <- exactly ONE event, all zeros
0x00000033) active-count = 2; sampling_period = 200.00 ms   <- framework IS listening
```

Straight from the driver, bypassing the framework entirely:

```bash
$ cat /sys/class/sensors/light_sensor/lux        # 0,0,0,0,2,0
$ cat /sys/class/sensors/light_sensor/raw_data   # 0,0,0,0,2,0
$ cat /sys/class/sensors/light_sensor/name       # VEML3328
```

The Samsung sensor stack is running (`vendor.sensors-hal-2-0-multihal`, `sscrpcd`, `factory.ssc`
all alive), the node exists, and it reads ~zero on every channel.

`android.sensor.light` is an **on-change** sensor: it only emits when the value changes. One zero
sample at boot and silence afterwards is exactly what you would see *either* from a dead driver
*or* from a tablet sitting in a genuinely dark spot.

**That ambiguity cannot be resolved from adb.** It needs someone to change the light.

### The test (takes 15 seconds)

With the tablet awake and face-up, run this and shine a phone torch at the **top edge near the
front camera**, then cover it with your hand:

```bash
adb shell "su -c 'for i in 1 2 3 4 5 6 7 8 9 10; do cat /sys/class/sensors/light_sensor/lux; sleep 1; done'"
```

- **Numbers move** → the sensor is fine, it was just dark. Enable adaptive brightness and you are
  done: `adb shell settings put system screen_brightness_mode 1`
- **Stays `0,0,0,0,2,0`** → the ALS is not functional under this GSI. Leave adaptive brightness off
  and remove this module; the resource is not the blocker and no overlay can fix it.

## Revert

```bash
adb shell "su -c 'rm -rf /data/adb/modules/autobrightness_t860'"
adb shell "settings put system screen_brightness_mode 0"
adb reboot
```

## Why this is worth keeping even if the sensor is dead

The overlay is a working, reusable template for changing *any* framework resource on this GSI —
which is the only way to alter `config_*` booleans and arrays that a GSI hardcodes. `build.ps1`
and `rro/` are about twenty lines total; point them at a different resource name and rebuild.
