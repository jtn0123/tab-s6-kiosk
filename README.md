# tab-s6-kiosk

Giving a 2019 **Samsung Galaxy Tab S6 (SM-T860)** a second life on Android 16: wipe One UI, run a
clean GSI, then patch back the hardware that the GSI breaks.

The tablet does double duty — **a mounted dashboard some of the time, a handheld video player the
rest.** Those two modes want opposite settings, so the patches here are written as independent
fixes you choose between, not one opinionated kiosk build.

Everything was done on real hardware, and the risky parts were validated in an Android 16 emulator
before touching the tablet.

## Status

**The flash is done.** Bootloader unlocked, TWRP installed, LineageOS 23.2 (Android 16) booted,
device-specific fixes verified running at the service level, apps installed, brightness and colour
corrected.

## Contents

| Folder | What |
|---|---|
| [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md) | **What is still broken and where to debug it** — start here |
| [`patches/`](patches/) | Nine independent patches for the tablet — display, audio, battery, kiosk, burn-in |
| [`inky-oled/`](inky-oled/) | Standalone Android dashboard app. No Raspberry Pi required |
| [`research/`](research/) | Emulator experiments behind the HDR patch, with results |

## The flash, in short

1. **Remove Google *and* Samsung accounts first.** Reactivation Lock blocks Odin outright.
2. Unlock bootloader (wipes, trips Knox permanently), reconnect Wi-Fi so the unlock sticks.
3. Odin: TWRP `.img.tar` → **AP**, `vbmeta.tar` → **CP**, **uncheck Auto Reboot**.
   Exit with Vol Down + Power, then instantly Vol Up + Power into TWRP.
4. TWRP: **Swipe to Allow Modifications**, Format Data (type `yes`), reboot to recovery.
5. Flash multidisabler → Install **Image** → target **System Image** → flash the GSI fixes zip →
   wipe Dalvik/cache → reboot.

Verify from the device rather than trusting the UI:

```bash
adb shell getprop ro.boot.flash.locked        # 0 = unlocked
adb shell getprop ro.boot.verifiedbootstate   # orange = unlocked
adb shell getprop | grep -E 'phh-spkrot|vibrator'   # fixes running?
```

## The device

```
SM-T860 (gts6lwifi)   Snapdragon 855   10.5" 2560x1600 AMOLED   4x Cirrus CS35L41 speakers
LineageOS 23.2-20260524-VANILLA-EXT4-GSI   Android 16 / SDK 36
```

## Inky OLED

A dashboard app inspired by [InkyPi](https://github.com/fatihak/InkyPi) — plugin cards, scheduled
refresh — but **running entirely on the tablet**. No Pi, no server, no e-ink hardware. Rendered for
a colour AMOLED instead of e-paper, hence the name.

Clock, current weather, and a 4-day forecast via [Open-Meteo](https://open-meteo.com/)
(**no API key**). ~17 KB APK, built with the Android SDK build-tools alone — no Gradle, no Maven,
no network.

It shares no code with InkyPi, only the idea.

## Patches

Each uses a different mechanism, so each applies and reverts on its own.

| # | Patch | Fixes | Root? | Risk |
|---|---|---|---|---|
| A | Display config — density + HDR | HDR headroom missing; UI oversized | yes | **bootloop if malformed** |
| B | Haptic strength | tuning only | yes | low |
| C | Treble toggles | brightness cap, fingerprint, audio policy | no | none |
| D | Usage mode — panel vs tablet | conflicting rotation/sleep settings | no | none |
| E | Audio DSP (JamesDSP) | no system EQ on a GSI | optional | none |
| F | Speaker tuning — **closed** | hypothesis disproven, no action needed | yes | none |
| G | Battery longevity — **applied** | 24/7 charging kills the cell | yes | none |
| H | Persistent wireless adb | wireless port is random every boot | yes | LAN security trade |
| I | OLED burn-in protection | static UI ghosts the panel | no | none |
| J | Video playback | **no AV1 hardware decode**; Widevine L3 | no | none |
| K | **Magisk root** | `adb root` kills all transports on this device | n/a | Play Integrity fails |
| L | Wi-Fi-only cleanup + battery % | permanent "No service"; battery % won't show | yes | none |
| M | SD card | endless "format this card" prompt | yes | **erases the card** |
| N | Adaptive brightness (RRO) | GSI hardcodes it off — **but the sensor is dead anyway** | yes | none (removed) |

Start with **C** and **J** — both free, and both fix real defects. C includes a fingerprint
procedure that likely disproves the "fingerprint never works on a GSI" folklore. J covers the AV1
decode cliff, which will stutter YouTube if left alone.

**Do K before anything that needs root.** `adb root` does not merely fail here — it takes USB *and*
wireless down until a reboot.

**A is the only one that can bootloop the device.** Do it last, and only if you want HDR back.

See [`patches/README.md`](patches/README.md).

## Known defects after flashing a GSI

What actually breaks on this device, and whether it is recoverable:

| Defect | Status |
|---|---|
| Only 2 of 4 speakers, wrong stereo on rotation | **Fixed** by the community fixes zip (routing) |
| No vibration (Android 16 dropped the HIDL vibrator) | **Fixed** — fixes zip ships an AIDL HAL |
| Internal storage not mounting | **Fixed** upstream (codec2 seccomp policy) |
| Brightness capped far below panel capability | **Fixed** — Treble "extend brightness range" |
| Colour clamped to sRGB on a P3 panel | **Improved** — vendor vivid mode |
| UI rendered at 360 dpi on a ~287 dpi panel | **Not a defect.** Samsung's own `/vendor/build.prop` sets `ro.sf.lcd_density=360`. The GSI matches stock exactly — see patch A |
| No adaptive brightness | **Not fixable.** The overlay works (patch N) but the ambient light sensor returns 0 lux under torchlight — the SSC ALS driver needs Samsung's sensor stack |
| HDR pipeline inert (`mMaxDesiredHdrRatio = 1.0`) | **Probably fixable** — patch A, unverified on-device |
| Speakers thinner than stock | **Not the DSP** — it is loaded and calibrated. Missing Atmos/SoundAlive; use patch E |
| `adb root` kills USB and wireless until reboot | **Worked around** — Magisk root, patch K |
| Wireless debugging port randomises; UI may not show it | **Fixed** — pinned to 5555, patch H |
| Battery held at 100% on a 24/7 panel | **Fixed** — capped at 80%, patch G |
| Permanent "No service" on a Wi-Fi-only tablet | **Fixed** — telephony features removed, patch L |
| Battery percentage will not display | **Fixed** — it's in LineageOS's own settings provider, patch L |
| SD card endlessly prompts to be formatted | **Fixed** — vold vs `sdfat` naming; reformat ext4, patch M |
| Fingerprint not working | **Probably fixable** — patch C3 |
| **No AV1 hardware decode** (SD855 limitation) | **Not a GSI bug.** Work around it — patch J |
| **Widevine L1 → L3** | **Permanent.** Knox fuse blown. HD Netflix/Disney+ gone |

## Things learned the hard way

- **Reactivation Lock blocks Odin outright.** Remove the Samsung *and* Google accounts before
  unlocking, or the flash fails with an auth error. Not mentioned in most guides.
- **The "speakers are routed but not tuned" theory is wrong.** It is a very plausible story — both
  community fixes only set ASPRX1 slot positions, so it *looks* like nothing loads the CS35L41 DSP.
  Reading the mixer proved otherwise: all four amps report the protection firmware loaded, HALO DSP
  running with a live heartbeat, and per-unit calibration applied. The gap is Samsung's *software*
  Atmos/SoundAlive layer. Had we "fixed" it by raising amp gain, we would have been overdriving
  speakers whose protection was working fine. See patch F.
- **`adb root` is worse than useless on this device.** It restarts adbd, the vendor USB gadget HAL
  loses the race, and the tablet drops off USB *and* wireless until a reboot. Use Magisk (patch K).
- **Magisk cannot unpack Samsung's `boot.img.lz4`** — it reports "unable to unpack boot image".
  Decompress to a raw `boot.img` on the PC first and check for the `ANDROID!` magic bytes.
- **`adb mdns services` fails silently** on networks that filter multicast — an empty list, not an
  error. To find the wireless port, read adbd's own log instead:
  `adb shell "logcat -d | grep 'adbwifi started'"`. No root needed.
- **LineageOS has a second settings provider.** `settings put system <key>` can succeed, read back
  correctly, and still do nothing, because the real value lives in `content://lineagesettings/system`
  under the same key name. Check there before believing a feature is missing — patch L.
- **Reformatting the SD card cannot fix the SD card.** vold looks for `exfat` in `/proc/filesystems`
  while Samsung's kernel registers that driver as `sdfat`, and Android formats big cards as exFAT by
  default — so each reformat recreates the fault. Patch M.
- **Grep matches inside comments.** `handheld_core_hardware.xml` looks like it declares telephony
  until you read it; every hit is commented out. The real declarations were elsewhere.
- **360 dpi was never a bug.** It looks wrong on a 287 dpi panel, and "correcting" it to 300 is
  tempting — but Samsung's own `/vendor/build.prop` sets `ro.sf.lcd_density=360`, so the GSI is
  matching stock precisely. Changing it is a preference (more content, smaller text), not a fix.
  Check what the vendor partition says before calling something a GSI defect.
- **A runtime resource overlay is the way to change framework `config_*` values.** A GSI hardcodes
  booleans it cannot know per-device. An RRO targeting `android`, built with aapt2 alone and
  dropped into `/product/overlay` by a Magisk module, changes them cleanly — patch N is a working
  ~20-line template.
- **A malformed display config bootloops `system_server`** and does *not* fail safe. `initFromFile`
  returns `true` even after a parse error, so the `config.xml` fallback never runs. Recovery is
  TWRP, not adb.
- **HDR loss is real and mostly unrecoverable**, but brightness and colour were both fixable — and
  those are what you actually notice.
- **`aapt2` on Windows writes asset subdirectory separators as backslashes**, silently breaking
  `file:///android_asset/` lookups. Keep assets flat.

## Ideas, not built

**Presence-based wake.** A mmWave sensor (LD2410 on an ESP32, via ESPHome) publishes
`binary_sensor.kitchen_presence` to Home Assistant. Inky OLED already talks to HA, so it polls that
entity and only holds the screen awake when someone is actually there. mmWave rather than PIR
because PIR thinks you left the moment you stand still. Solves burn-in and usefulness together
instead of trading one against the other.

Implementation note for later: releasing `FLAG_KEEP_SCREEN_ON` is enough to let the screen sleep
normally; *waking* it needs a wake permission. Forcing an immediate screen-off would require
device-admin rights — avoid.

**Others:** NAS photo-rotation card (doubles as burn-in mitigation), now-playing tile from
Plex/Jellyfin, kitchen timer, on-device settings UI, screen pinning.

## Secret scanning

This repo documents work on a real device, so logs and reports can easily pick up serials, account
emails, LAN addresses and tokens. Three layers guard against publishing any of it:

```bash
git config core.hooksPath .githooks          # enable the pre-commit hook, once per clone
powershell -File scripts/scan-secrets.ps1    # scan tracked files on demand
```

- **`scripts/scan-secrets.ps1`** — no install needed. Detects AWS/GitHub/Google/OpenAI/Anthropic/
  Slack keys, private key blocks, JWTs, connection strings and password assignments, plus
  project-specific PII: emails, private LAN IPs, Android serials, local user paths.
  Placeholders like `<tablet-ip>` are allowlisted. Exit 1 on findings.
- **`.githooks/pre-commit`** — runs the scanner against staged changes and blocks the commit.
- **`.github/workflows/secret-scan.yml`** — gitleaks over full history plus the repo scanner, on
  every push and weekly.

The working log (`PROGRESS.md`) is deliberately **gitignored** — it contains device serials and
account addresses. This README carries the publishable findings instead.

Verified by planting fake credentials and confirming all of them were caught.

## Warning

Unlocking this tablet's bootloader **wipes it and permanently trips Knox**. Widevine drops L1 → L3.
None of that is reversible. Patch A can bootloop the device if edited carelessly. Read the READMEs.
