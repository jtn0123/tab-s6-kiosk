# Patch N — Adaptive brightness (runtime resource overlay)

**Status: the overlay works. Adaptive brightness does not, and cannot. Module removed from the
device; kept here as a template.**

The overlay does exactly its job — `mAutoBrightnessAvailable` false→true, `mBrightnessReason`
manual→automatic. But the ambient light sensor returns zero regardless of actual light, which was
**confirmed by physical test** (see below), so adaptive brightness would pin the screen at ~2.7%.

**Do not install this expecting working adaptive brightness.** Its lasting value is as a worked
example of changing a hardcoded framework resource on a GSI.

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

`android.sensor.light` is an **on-change** sensor, so a single zero sample could equally mean a dead
driver *or* a tablet sitting somewhere dark. That ambiguity cannot be resolved over adb — it needs
someone to change the light.

### The physical test — and the verdict

Sampled the driver node and the framework once a second for 20 seconds while a phone torch was
shone directly at the sensor and waved around to vary it:

```
1   driver=[0,0,0,0,2,0]  framework=mAmbientLux=-1.0
2   driver=[0,0,0,0,2,0]  framework=mAmbientLux=-1.0
...
20  driver=[0,0,0,0,2,0]  framework=mAmbientLux=-1.0
```

Not one value moved. And the framework *is* receiving a steady 5 Hz event stream — every event is
zero:

```
veml3328 Ambient Light Sensor: last 50 events
     1 (ts=97.559603300) 0.00, 0.00, 0.00,
     2 (ts=97.759596425) 0.00, 0.00, 0.00,
     3 (ts=97.959436477) 0.00, 0.00, 0.00,     <- 200ms apart, all zero
```

**Verdict: the ALS is non-functional under this GSI.** Delivery works; the data is zero.

### Why it cannot be fixed from here

The chip is on i2c at `9-0033` (matching sensor handle `0x00000033`) and is driven by the
**Snapdragon Sensor Core** through `sscrpcd`, not by a directly controllable kernel driver. Every
sysfs node is read-only and there is **no `enable` node at all**:

```
-r--r--r--  lux
-r--r--r--  raw_data
-r--r--r--  name        VEML3328
-r--r--r--  vendor      CAPELLA
drwxr-xr-x  power       (runtime-PM only - no sensor enable)
```

So there is nothing to poke. The SSC's ALS driver needs Samsung's system-side sensor configuration,
which the GSI replaced. No resource overlay can reach it — the resource was never the blocker.

Fixing it would mean restoring Samsung's sensor stack, which is the same class of problem as the
missing Dolby/SoundAlive audio layer: a proprietary system-side component a GSI cannot carry.

### Current state on the device

Module **removed**, `screen_brightness_mode=0` (manual). Brightness is set manually and stays put.

## Why this is kept

The overlay is a working, reusable template for changing *any* framework resource on this GSI —
the only way to alter `config_*` booleans and arrays a generic image hardcodes. `build.ps1` and
`rro/` are about twenty lines total; point them at a different resource name and rebuild.

To reuse it, edit `rro/res/values/config.xml`, rebuild, and ship the APK in a Magisk module at
`system/product/overlay/`. Framework overlays **must** be preinstalled — `pm install` will not work
for one targeting `android`.

## Install (only if you have a reason)

```bash
powershell -File build.ps1
# then place autobrightness-overlay.apk at
#   <module>/system/product/overlay/ and reboot
```

## Revert

```bash
adb shell "su -c 'rm -rf /data/adb/modules/autobrightness_t860'"
adb shell "settings put system screen_brightness_mode 0"
adb reboot
```
