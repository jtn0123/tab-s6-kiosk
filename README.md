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
| E | Audio DSP (RootlessJamesDSP) | no system EQ on a GSI | no | none |
| F | Speaker tuning — **diagnostic** | speakers routed but not tuned | yes | none |
| G | Battery longevity — **diagnostic** | 24/7 charging kills the cell | yes | none |
| H | Persistent wireless adb | USB drops when adbd restarts | yes | LAN security trade |
| I | OLED burn-in protection | static UI ghosts the panel | no | none |
| J | Video playback | **no AV1 hardware decode**; Widevine L3 | no | none |

Start with **C** and **J** — both free, and both fix real defects. C includes a fingerprint
procedure that likely disproves the "fingerprint never works on a GSI" folklore. J covers the AV1
decode cliff, which will stutter YouTube if left alone.

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
| UI rendered at 360 dpi on a ~287 dpi panel | **Fixable** — patch A |
| HDR pipeline inert (`mMaxDesiredHdrRatio = 1.0`) | **Probably fixable** — patch A, unverified on-device |
| Speakers routed but **not tuned** (CS35L41 DSP) | **Under investigation** — patch F |
| Fingerprint not working | **Probably fixable** — patch C3 |
| **No AV1 hardware decode** (SD855 limitation) | **Not a GSI bug.** Work around it — patch J |
| **Widevine L1 → L3** | **Permanent.** Knox fuse blown. HD Netflix/Disney+ gone |

## Things learned the hard way

- **Reactivation Lock blocks Odin outright.** Remove the Samsung *and* Google accounts before
  unlocking, or the flash fails with an auth error. Not mentioned in most guides.
- **The four speakers are only *routed*, not *tuned*.** Both community fixes set ASPRX1 slot
  positions; neither touches the CS35L41 amps' onboard DSP. That is likely why they sound thinner
  than stock — see patch F.
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
