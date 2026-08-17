# Known issues — what is broken, and exactly where to look

State of the tablet as audited **2026-08-16**, after patches G, H, K, L, M.

Ordered by **how much your effort is likely to be worth**. Everything here has a concrete command
or file path, so you can verify my claims rather than trust them.

Quick state dump before you start:

```bash
adb shell "su -c 'sh /data/local/tmp/audit.sh'"     # if still present
```

---

# 1. Worth your time — broken, fixable, untried

## 1.1 Inky OLED — RESOLVED 2026-08-16

Installed, launched, verified rendering clock + live local weather + forecast on the device.
The committed `config.js` keeps the Seattle placeholder deliberately — the repo is public, and
the real location stays local-only (`git update-index --skip-worktree` on `config.js` and the
built `inkyoled.apk`). If you clone fresh, set your own lat/lon and rebuild.

## 1.2 SmartTube AV1 stutter — RESOLVED 2026-08-16

Video preset pinned to **1080p 60fps vp9** (Settings → Player → Video presets). The Snapdragon
855 has no AV1 hardware decoder; this keeps YouTube on the hardware VP9 path. If a video still
stutters, confirm what it is actually decoding:

```bash
adb shell dumpsys media.player | grep -iE "codec|mime"
```

## 1.3 JamesDSP — installed, not onboarded (owner chose to skip)

On first launch it shows an Android 15+ screen-capture restriction notice: system-audio capture
now redacts protected content unless "Disable screen share protections" is enabled in developer
settings. The owner declined the setup 2026-08-16 — reasonable; it is a workaround stacked on a
workaround. Revisit only if system-wide EQ becomes worth that trade.

**Status: APK installed with permissions pre-granted; never opened.**

`me.timschneeberger.rootlessjamesdsp` is present. It needs a one-time in-app setup (it captures the
audio session). This is the **only** route to system-wide EQ on this GSI, and the closest available
substitute for the Samsung audio layer discussed in §2.3.

**Where to debug:** open the app, complete onboarding, then verify it is capturing:

```bash
adb shell dumpsys media.audio_flinger | grep -iE "effect|session" | head
```

---

# 2. Confirmed broken, and not fixable from here

Do not spend time on these. Each was investigated to root cause.

## 2.1 Fingerprint — attempted 2026-08-16, unfixable off stock firmware

**Tried, hard, with the C3 procedure and well beyond it. Do not retry.** The full attempt and
every finding is documented in `patches/O-fingerprint-udfps/README.md`. Summary of how far the
chain got:

| Layer | State |
|---|---|
| Sensor hardware (Egis ET713 optical, `/dev/esfp0`) | present |
| Samsung TZ service (`bauth_FPBAuthService`) | running, polls `preenroll_flag: 1` |
| Touch-firmware FOD zone (`/sys/class/sec/tsp/cmd` → `fod_enable`, `set_fod_rect`) | accepts commands, `:OK` |
| Touch → HAL finger event | **fired exactly once** (`onAcquired(6, 10001)`) |
| Screen illumination at the sensor (`SDM Fingerprint Indisplay Layer`) | **never arms — this is the wall** |

The ET713 is *optical*: it photographs your fingertip lit by the panel. The bright green/white
glow you remember from stock **is** the sensor's light source, and the code that produces it is
Samsung's proprietary One UI system layer — not in the vendor partition, not in any GSI, not
installable.

Corroboration that this is not a skill issue: the XDA **One UI 6 port for this exact tablet** —
Samsung's own firmware, rebuilt — is titled *"All hardware working except fingerprint"*, and the
One UI 7 port says the same. If Samsung-firmware ports can't light this sensor off stock, a GSI
cannot.

Two traps discovered for anyone who retries anyway:

1. **The AOSP UDFPS route actively breaks the only working path.** An RRO setting
   `config_udfps_sensor_props` produces a beautiful proper enroll UI — whose
   `UdfpsControllerOverlay` then *steals the touch input* away from phh's patched Settings
   (`PHH-Enroll`), which is the only component that ever forwarded a press to the HAL. It also
   dies at `UdfpsHelper: failed to cast the HIDL to V2_3` — Samsung's blob predates that
   interface. The overlay is kept, unused, in `patches/O-fingerprint-udfps/`.
2. **The sensor is not where the kernel node's naive reading says.** Converting
   `11.74mm-from-bottom` gives portrait (800, 2428); the owner's stock muscle memory and their
   first instinctive press (recorded at (640, 1941)) put the real spot at center-x,
   **y ≈ 1900–2150** — an inch-plus higher. The panel is mounted rotated
   (`installOrientation 3`), so treat the node's frame as unverified. Details in
   `patches/O-fingerprint-udfps/README.md`.

## 2.2 Ambient light sensor — dead, so no adaptive brightness

**Proven by physical test**, not inference: a torch was shone directly at the sensor and waved
around for 20 seconds. Nothing moved.

```bash
$ cat /sys/class/sensors/light_sensor/lux
0,0,0,0,2,0        # identical under torchlight, every time
$ dumpsys sensorservice | grep -A3 "veml3328.*last"
 1 (ts=97.559603300) 0.00, 0.00, 0.00,
 2 (ts=97.759596425) 0.00, 0.00, 0.00,     # 5 Hz stream, every event zero
```

Delivery works; the data is zero. The chip is on i2c `9-0033`, driven by the **Snapdragon Sensor
Core** via `sscrpcd` — not a directly controllable kernel driver. Every sysfs node is read-only and
**there is no `enable` node**:

```bash
$ ls -la /sys/class/sensors/light_sensor/
-r--r--r--  lux
-r--r--r--  raw_data
-r--r--r--  name          # VEML3328
drwxr-xr-x  power         # runtime-PM only, not a sensor enable
```

**Where to look if you want to try anyway:** it needs Samsung's system-side sensor configuration,
which the GSI replaced. The framework side is already solved — `patches/N-autobrightness/` flips
`config_automatic_brightness_available` and verifiably works. The resource was never the blocker.

Module removed; brightness left manual. **Do not enable adaptive brightness** — with a dead sensor
it pins the screen to ~2.7%.

## 2.3 Speakers thinner than stock — but not for the reason everyone says

**The popular theory is wrong, and I verified it.** "The four speakers are routed but not tuned" is
plausible — both community fixes only set ASPRX1 slot positions. Reading the mixer disproves it:

```bash
adb shell "su -c 'tinymix -D 0'" | grep -E "(FL|FR|RL|RR) (DSP Booted|DSP1 Firmware)"
```

All four amps report `DSP Booted = On`, `DSP1 Firmware = Protection`, `HALO_STATE = 2` with a live
incrementing heartbeat, `CSPL_ENABLE = 1`, and per-unit calibration applied (`CAL_STATUS = 1`,
`CAL_R = 0x2184`, checksum matching).

The CS35L41 protection and tuning DSP **is loaded and calibrated.** What is missing is Samsung's
*software* Dolby Atmos / SoundAlive layer — a proprietary system-side stack a GSI cannot carry.

⚠️ **Do not raise amp gain to compensate.** Speaker protection exists because these drivers can be
physically destroyed by overdriving, and unlike a bad config that is not recoverable in TWRP.

**Best available substitute:** JamesDSP (§1.3).

Also note the mixer is running **2-channel**:

```bash
$ dumpsys media.audio_flinger | grep -i "channel mask"
Channel mask: 0x00000003 (front-left, front-right)
```

Expected for stereo content, but worth remembering if you chase 4-speaker behaviour.

## 2.4 Widevine L1 → L3 — permanent

Unlocking the bootloader blew the Knox fuse. Netflix/Disney+ are SD-only forever. Nothing to debug.

## 2.5 No AV1 hardware decode — silicon, not software

Snapdragon 855 predates AV1. Not a GSI bug. Work around it (§1.2).

---

# 3. Worked around, but the underlying fault is still there

## 3.1 `adb root` takes the tablet off USB *and* wireless

**Reproduced three times.** It restarts adbd, the vendor USB gadget HAL loses the re-enumeration
race, and the TLS server does not come back either. Only a reboot recovers it.

**Never run `adb root` on this device.** Use Magisk's `su` (patch K) — adbd never restarts:

```bash
adb shell "su -c 'id'"      # uid=0(root) ... context=u:r:magisk:s0
```

## 3.2 Wireless debugging: random port, and the UI may not show it

The Settings screen sometimes displays an IP with **no port**, and `adb mdns services` returns an
empty list on networks filtering multicast — silently, not as an error.

Pinned to 5555 (patch H), re-armed each boot by `/data/adb/service.d/battery-cap.sh` because
`adb_wifi_enabled` resets to 0 on **every** boot even with the port pinned.

**If it ever goes missing again**, read adbd's own log — no root needed, `shell` is in the `log`
group:

```bash
adb shell "logcat -d | grep 'adbwifi started'"
```

## 3.3 The pairing port is single-use

`adb pair` succeeds on one port; the **connect** port is a different number. Pairing does not give
you a working connection on the same port — a genuinely confusing failure mode.

---

# 4. Unverified — claims in this repo nobody has tested on hardware

## 4.1 HDR (patch A) — never applied

```bash
$ ls /vendor/etc/displayconfig/
No such file or directory
$ dumpsys display | grep -E "mHdrBrightnessData|mMaxDesiredHdrRatio|mHdrBoostDisabled"
mHdrBrightnessData=null
mMaxDesiredHdrRatio=1.0
mHdrBoostDisabled=true
```

The pipeline is inert. The panel *does* advertise HDR10/HLG/HDR10+ at 564.3 nits peak, so there is
something real to recover.

⚠️ **This is the only patch that can bootloop the device.** A malformed display config does **not**
fail safe — `initFromFile` returns `true` even after a parse error, so the `config.xml` fallback
never runs and `system_server` crash-loops. Recovery is TWRP, not adb.

Five children of `<hdrBrightnessConfig>` are mandatory or it will not boot. `apply.ps1` refuses to
install if any are missing — **do not bypass that check.**

**Verdict: emulator-validated, hardware-unverified.** Do it last, with TWRP ready.

## 4.2 Haptics (patch B) — untested

Writes to `/vendor/build.prop`. Tuning only, low risk, nobody has tried it.

---

# 5. Benign — looks broken, is not. Don't chase these.

- **`PowerStatsService` / `KernelCpuUid*BpfMapReader` failures at boot.** Standard GSI noise on a
  vendor kernel lacking the BPF maps AOSP expects. No user-visible effect.
- **`vendor_flash_recovery` fails to start** with an SELinux label complaint. It is Samsung's
  stock-recovery restorer — you actively *do not* want it running with TWRP installed.
- **No SELinux denials.** Checked; the log is clean. Not a source of any problem here.
- **Battery reads 100% with the cap at 80%.** Correct behaviour — see `patches/G-battery/README.md`.
  The cap blocks charging *above* the threshold and cannot discharge; a plugged-in tablet runs off
  USB and never draws the cell down. Verified enforced: cap off → 408 mA "Charging", cap on →
  17 mA "Not charging".
- **`status` reads `Not charging` rather than `Full`.** That *is* the cap working. A normally
  terminated full battery reports `Full`.

---

# 6. Traps that cost real time — read before debugging anything

1. **`settings put system <key>` can succeed and do nothing.** LineageOS keeps its own values in
   `content://lineagesettings/system` under *identical key names*. Always check there before
   concluding a feature is missing:
   ```bash
   adb shell "su -c 'content query --uri content://lineagesettings/system'"
   ```
2. **Reformatting the SD card cannot fix the SD card.** vold looks for `exfat` in
   `/proc/filesystems`; Samsung's kernel registers that driver as `sdfat`. Android formats large
   cards as exFAT by default, so every reformat recreates the fault. Patch M.
3. **Grep matches inside comments.** `handheld_core_hardware.xml` looks like it declares telephony
   until you read it — every hit is commented out.
4. **360 dpi is not a bug.** Samsung's own `/vendor/build.prop` sets `ro.sf.lcd_density=360`. This
   repo previously called it a defect. Changing it to 300 is a *preference* that moves away from
   stock, and needs no patch — `wm density 300`, reverted with `wm density reset`.
5. **Magisk cannot unpack Samsung's `boot.img.lz4`.** Decompress PC-side first and check for the
   `ANDROID!` magic bytes.
6. **PowerShell mangles `$(...)` inside `adb shell`.** It expands them locally against `C:\` and
   silently sends garbage. Put anything non-trivial in a `.sh` file, `adb push` it, and run
   `sh /data/local/tmp/x.sh`. This wasted more time this session than any actual device fault.
7. **`kill` on a shell loop appears to do nothing** for up to 30s — it sits in `sleep`. And
   `kill -9` skips the `trap`, which for `drain-to-cap.sh` leaves the tablet discharging with
   nothing watching it.

---

# 7. If you are picking this up cold

The device currently runs LineageOS 23.2 (Android 16) with Magisk root, wireless adb pinned to
5555, an 80% charge cap, a working 512 GB ext4 SD card, no phantom "No service", and battery
percentage visible.

As of 2026-08-16 evening, §1 is cleared: Inky OLED installed and running, SmartTube pinned to
VP9 1080p60, JamesDSP deliberately skipped. Fingerprint is settled: attempted thoroughly and
confirmed unfixable off stock firmware (§2.1) — do not reopen it.

What remains, all optional: **patch B haptics** (untested, low risk) and **patch A HDR** (the
one bootloop-capable patch — do it last, TWRP ready, see §4.1).
