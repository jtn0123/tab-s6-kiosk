# tab-s6-kiosk

Turning a 2019 **Samsung Galaxy Tab S6 (SM-T860)** into a kitchen wall panel: wipe One UI, run a
clean Android 16 GSI, patch the hardware quirks back, and put a dashboard on it.

Everything here was done on real hardware, and the risky parts were validated in an Android 16
emulator before touching the tablet.

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

| # | Patch | Root? | Risk | Survives GSI update? |
|---|---|---|---|---|
| A | Display config — density + HDR | yes | **bootloop if malformed** | no |
| B | Haptic strength | yes | low | no |
| C | Treble toggles — audio, fingerprint, brightness | no | none | yes |
| D | Kiosk settings | no | none | yes |
| E | Audio DSP (RootlessJamesDSP) | no | none | yes |
| F | Speaker tuning — **diagnostic only** | yes | none | n/a |
| G | Battery longevity — **diagnostic only** | yes | none | n/a |
| H | Persistent wireless adb | yes | LAN security trade | yes |
| I | OLED burn-in protection | no | none | yes |

Recommended order **C → D → E → B → A**. Start with C: free, instant, and it includes a fingerprint
procedure that likely disproves the "fingerprint never works on a GSI" folklore.

See [`patches/README.md`](patches/README.md).

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

## Not done

WebView kiosk hardening (auto-start, screen pinning), InkyPi integration, on-device settings UI.
Ideas are tracked at the end of `PROGRESS.md`.

## Warning

Unlocking this tablet's bootloader **wipes it and permanently trips Knox**. Widevine drops L1 → L3.
None of that is reversible. Patch A can bootloop the device if edited carelessly. Read the READMEs.
