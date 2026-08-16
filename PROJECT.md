# Tab S6 Kitchen Panel

Repurpose a Samsung Galaxy Tab S6 (2019, Snapdragon 855, Super AMOLED 2560x1600) into a
wall-mounted kitchen display: clean AOSP base, no Samsung/Google junk, three "apps" total —
InkyPi panel, YouTube (SmartTube), web browser.

**This file is the single source of truth for the project.** Update checkboxes and the
decision/status logs as things happen.

---

## Status

| Date | Update |
|---|---|
| 2026-08-16 | Project created. Planning done, nothing flashed yet. |
| 2026-08-16 | Model confirmed **SM-T860 (Wi-Fi)**. Tablet charging; OEM-unlock check pending. Odin host machine TBD. |
| 2026-08-16 | **GREEN LIGHT**: OEM unlocking present. Firmware T860XXS5DWH1 / XAR / bootloader v5. Remaining Phase 0: software-update check, gaming PC SSH, downloads staging, backup, hardware bits. |

---

## Architecture

| Layer | Choice | Notes |
|---|---|---|
| Base OS | LineageOS/TrebleDroid GSI (arm64), **vanilla — no GMS** | Samsung vendor blobs stay underneath (Treble model) |
| Recovery | TWRP (Mentalmuso build) via Odin | |
| YouTube | SmartTube APK | No GMS needed; force VP9 in settings → hardware decode (SD855 has no AV1 decode) |
| Browser | Brave or Fulguris APK | |
| InkyPi client | Custom WebView kiosk APK (set as launcher) + InkyPi PWA fallback | Built in this repo, `kiosk-app/` |
| InkyPi server | `panel` device profile + live HTML routes | PRs to **jtn0123/InkyPi** (the fork, NOT the parent repo) |

---

## Phases

### Phase 0 — Prep (no flashing, reversible)
- [x] Confirm exact model: **SM-T860 (Wi-Fi)** — confirmed 2026-08-16
- [x] Confirm **OEM unlocking** toggle exists in Developer options — **present, GO** (2026-08-16)
- [x] Note current firmware: **SP2A.220305.013 / T860XXS5DWH1** (Android 12 / One UI 4.1, ~Aug 2023 patch), CSC **XAR** (US unbranded), **bootloader rev 5** (staged firmware must be v5+)
- [ ] Software update check on tablet — if "up to date", already on final stock; else let it finish and record new build
- [x] USB debugging enabled in Developer options
- [x] Solve the Odin problem: **physical Windows gaming PC**, Claude drives via RDP/SSH from the Mac, Justin handles tablet + button combos. VM rejected (USB passthrough risk). Heimdall = backup only.
- [ ] Enable OpenSSH Server on gaming PC + key auth, so downloads can be staged remotely
- [ ] Download + stash stock firmware for recovery (SamFw/Frija) → `downloads/` (gitignored)
- [ ] Download TWRP for gts6l/gts6lwifi + patched vbmeta (XDA thread links below)
- [ ] Pick + download GSI image (arm64) from the Tab S6 GSI thread
- [ ] Back up anything on the tablet worth keeping (unlock = full wipe)
- [ ] Hardware: smart plug for 85% charge cycling, wall mount ideas, cable routing

### Phase 1 — Flash weekend
- [ ] Enable OEM unlocking → unlock bootloader (wipes device, blows Knox fuse — permanent)
- [ ] Odin: TWRP in AP + vbmeta, auto-reboot OFF
- [ ] TWRP: format data, flash GSI system.img
- [ ] First boot + hardware check: Wi-Fi, touch, speakers, brightness, sleep/wake, rotation
- [ ] Verify YouTube 1080p60 playback smooth (VP9, hardware decode, no thermal issues)
- [ ] Record what's broken vs working in the status log

### Phase 2 — Appliance setup
- [ ] Sideload SmartTube; settings: force VP9, cap 1080p60, disable AV1
- [ ] Sideload browser
- [ ] Screen timeout / burn-in mitigations (dark UI, no static max-brightness content)
- [ ] Smart plug charge schedule (~30 min every few hours, hold battery near 60-85%)
- [ ] Verify InkyPi web UI reachable + usable from the tablet browser

### Phase 3 — Kiosk APK (`kiosk-app/`, built here)
- [ ] Scaffold: Kotlin, fullscreen WebView → InkyPi URL, immersive mode
- [ ] Boot receiver: auto-launch on power-on
- [ ] Set as HOME/launcher so the tablet boots straight into the panel
- [ ] Keep-screen-on + screen off/on control (schedule; motion-wake if we add camera later)
- [ ] Layout drift / burn-in guard (slow px translate) if not handled server-side
- [ ] Settings screen: server URL, reload, kiosk escape gesture

### Phase 4 — InkyPi `panel` profile (LAST — PRs to jtn0123/InkyPi)
- [ ] `PanelDisplay` backend alongside inky/waveshare (`src/display/`)
- [ ] `render_html()` on BasePlugin + `/live/<instance>` route (serve HTML, skip screenshot step)
- [ ] Panel device profile: 2560x1600, full color, animation allowed, no palette quantization
- [ ] SSE-driven refresh (reuse `/api/events`) instead of polling
- [ ] Video loop support in image_folder/image_album (`<video autoplay muted loop>`, MP4/WebM not GIF)
- [ ] Audit plugin templates for hardcoded e-ink dimensions/palette assumptions
- [ ] Touch interactions (tap to advance recipe, check off todo) — stretch

---

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-08-16 | GSI over One UI 7 port or debloated stock | Goal is removing Samsung layer entirely; T860/T865 has no official LineageOS device tree, GSI is the supported community path |
| 2026-08-16 | Vanilla GSI, no GMS/microG | Appliance use; SmartTube + sideloading covers everything; less junk |
| 2026-08-16 | SmartTube for YouTube | No GMS dependency, no ads, explicit codec picker avoids AV1 software decode on SD855 |
| 2026-08-16 | MP4/WebM loops instead of real GIFs | Hardware decoded, smaller, better quality |
| 2026-08-16 | Custom WebView kiosk APK over Fully Kiosk | Fits the project; boots straight into panel as launcher; Fully Kiosk remains fallback |
| 2026-08-16 | InkyPi server work is the LAST phase | Tablet must be flashed + stable first; panel can point at existing `/api/current_image` meanwhile |
| 2026-08-16 | InkyPi PRs go to jtn0123/InkyPi | User's fork is the live project; do not PR the parent repo |
| 2026-08-16 | Flash via physical Windows gaming PC (RDP/SSH remote-driven), not a Mac VM | Direct USB removes passthrough-hiccup-mid-write risk; SSH lets downloads be staged ahead of flash day |

---

## Known losses (accepted)

- Knox fuse blown permanently (Samsung Pay/Secure Folder dead even on reflash to stock)
- Widevine L1 → L3 (Netflix-class apps capped at 480p; YouTube unaffected)
- Fingerprint, S Pen extras, DeX, Samsung camera quality — all irrelevant for a wall panel
- Manual updates only (no OTA)

## Risks to manage

- **AMOLED burn-in**: dark UI, content rotation, layout drift, screen off when idle. Biggest design constraint.
- **Battery swelling**: never hold at 100% 24/7. Smart plug duty cycle. Non-negotiable for a wall-mounted 2019 battery.
- **GSI rough edges**: storage/speakers/haptics have known fixes in the XDA threads; expect small bugs.

---

## Links

- [XDA — GSI install instructions for Tab S6 (SM-T860/T865)](https://xdaforums.com/t/aosp-rom-official-android-14-gsi-install-instructions-for-galaxy-tab-s6-sm-t860-sm-t865.4573383/)
- [The Custom Droid — Tab S6 unlock / TWRP / root guide](https://www.thecustomdroid.com/samsung-galaxy-tab-s6-twrp-root-guide/)
- [XDA — Android 15 on T860 discussion](https://xdaforums.com/t/android-15-on-t860-samsung-galaxy-tab-s6-wi-fi.4673019/)
- [XDA — Tab S6 ROMs/kernels/recoveries forum](https://xdaforums.com/f/samsung-galaxy-tab-s6-roms-kernels-recoveries.9132/)
- [SmartTube](https://github.com/yuliskov/SmartTube)
- [InkyPi (jtn0123 fork)](https://github.com/jtn0123/InkyPi) — local: `~/Documents/Github/InkyPi`
- Detailed flash steps: [docs/flash-walkthrough.md](docs/flash-walkthrough.md)
