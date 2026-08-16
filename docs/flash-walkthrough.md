# Tab S6 Flash Walkthrough (unlock → TWRP → GSI)

> Working doc — verify each download against the XDA threads linked in
> [PROJECT.md](../PROJECT.md) before flashing. Model-specific files differ between
> SM-T860 (Wi-Fi) and SM-T865 (LTE); confirm the model first.

## 0. Prerequisites

- Exact model + current firmware noted (Settings → About tablet)
- **OEM unlocking** visible in Developer options (tap Build number 7x to enable dev options)
- Latest stock One UI 4.1 installed (GSI uses these vendor blobs)
- A Windows machine (or VM with USB passthrough) for Odin — Heimdall is the macOS fallback
- Downloads staged in `downloads/` (gitignored):
  - Stock firmware for your exact model (SamFw / Frija) — recovery insurance
  - Odin (3.14+)
  - TWRP for Tab S6 (Mentalmuso, from XDA) + patched `vbmeta.tar`
  - GSI image, **arm64** variant (extract `system.img` from the download)
  - SmartTube + browser APKs (for after)
- Battery > 50%, everything worth keeping backed up (unlock wipes)

## 1. Unlock bootloader

⚠️ Wipes the device. Blows the Knox e-fuse permanently.

1. Developer options → toggle **OEM unlocking** on
2. Power off. Hold **Vol Up + Vol Down**, plug in USB-C to enter download mode
3. Long-press **Vol Up** for the unlock menu → confirm
4. Device wipes and reboots. Go through minimal setup, **connect Wi-Fi**
   (required so the unlock state sticks), re-enable Developer options and
   confirm OEM unlocking now shows greyed-out/on

## 2. Flash TWRP via Odin

1. Download mode again (Vol Up + Vol Down + USB-C)
2. Odin: TWRP `.tar` in **AP**, `vbmeta.tar` in the slot the XDA thread specifies
3. Options tab: **uncheck Auto Reboot**
4. Start. On PASS: hold Vol Down + Power to exit, then immediately switch to
   **Vol Up + Power to boot straight into TWRP** — booting stock first can
   replace recovery

## 3. Flash the GSI in TWRP

1. Wipe → Advanced Wipe → Dalvik/ART Cache + Cache
2. Wipe → **Format Data** → type `yes` (kills stock encryption; required)
3. Reboot back into TWRP, transfer `system.img` (MTP or `adb push /sdcard/`)
4. Install → Install Image → select `system.img` → target **System Image**
5. Wipe caches again, reboot system. First boot takes several minutes

## 4. First-boot verification

Check and record results in PROJECT.md status log:

- [ ] Boots to AOSP setup
- [ ] Wi-Fi, Bluetooth
- [ ] Touch + multitouch
- [ ] Speakers (known GSI fix exists if broken — see XDA thread)
- [ ] Brightness control, auto-rotate
- [ ] Sleep/wake reliable
- [ ] Storage shows correct size (known fix if not)
- [ ] YouTube test clip at 1080p60 — smooth, no heat

## 5. If it goes wrong

- Bootloop / no boot: back to download mode → Odin flash the stashed **stock
  firmware** (AP/BL/CP/CSC) → device returns to stock (Knox stays blown, that's
  cosmetic at this point)
- Download mode is nearly impossible to brick past — as long as
  Vol Up + Vol Down + USB gets you the download screen, you can recover
