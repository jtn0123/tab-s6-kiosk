# Tab S6 Kitchen Panel

Repurpose a Samsung Galaxy Tab S6 (2019, Snapdragon 855, Super AMOLED 2560x1600) into a
wall-mounted kitchen display: clean AOSP base, no Samsung/Google junk, three "apps" total —
InkyPi panel, YouTube (SmartTube), web browser.

**This file is the single source of truth for the project.** Update checkboxes and the
decision/status logs as things happen.

---

## Status

- **2026-08-21 — Repos consolidated.** This Mac-side tracker was merged into the public GitHub repo
  `jtn0123/tab-s6-kiosk` (which the Windows session had created: 15 device patches A–O, research, KNOWN-ISSUES,
  secret scanning). The Windows session's "Inky OLED" Android app (fullscreen WebView dashboard, ~7.6k lines,
  339 tests, 12 screens, InkyPi newspaper/picture widgets ported) moved **with history** to
  `jtn0123/InkyPi` → `clients/android/` (draft PR https://github.com/jtn0123/InkyPi/pull/635 — CI green; CodeQL findings fixed). Side fix: PR #637 bumps pip to 26.2 for PYSEC-2026-3721, which was failing InkyPi's Security job on every branch. The copy here was
  removed so there is one canonical app. NAS dumps of both repos were broken partial copies; the only unique
  content (an uncommitted InkyPi typing-cleanup WIP) is saved as `S6 Tab\Inkypi-uncommitted-*.{patch,py}`.
  Windows log archived locally only (`docs/PROGRESS-windows-session.md`, gitignored — serials/IPs).

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
- [x] Software update check: moot — Samsung's FUS server confirms DWH1 is the latest OTA for XAR (verified via samloader 2026-08-16). A newer factory package T860XXU5DXJ1 (Oct 2024 maintenance, same 2023-08 security patch) exists on samfw; staged as the restore copy.
- [x] USB debugging enabled in Developer options
- [x] Solve the Odin problem: **physical Windows gaming PC**, Justin at the keyboard. VM rejected (USB passthrough risk). Heimdall = backup only.
- [x] ~~SSH into gaming PC~~ **ABANDONED 2026-08-16** — PC's Windows servicing stack is broken (likely gaming debloat); capability installer hung, removed OpenSSH files, MSI reinstall silently failed. Not worth more time. New plan: stage downloads on the Mac → 512GB USB drive → PC. Flash day is chat-guided (or Chrome Remote Desktop if wanted — browser-based, no Windows services). Leftover on PC: none (orphaned sshd service was deleted; authorized_keys file in C:\ProgramData\ssh is inert).
- [~] Stage all downloads to the NAS: `\\<nas>\media\Media\S6 Tab` (mounted at `/Volumes/media/Media/S6 Tab` on the Mac). Gaming PC reads the share directly on flash day; USB drive no longer needed.
  - [x] 02: Odin 3.14.4 (SamFw mirror) + Samsung USB driver
  - [x] 03: TWRP **3.7.0_9-0-gts6lwifi** (dl.twrp.me, 64MB) + generic AVB-disabled **vbmeta.tar** (dl.twrp.me/gts4lv — correct per both GSI guides)
  - [x] 04: **MisterZtr LineageOS 23.2 (Android 16) VANILLA EXT4 GSI** `LineageOS-23.2-20260524-VANILLA-EXT4-GSI.7z` (0.9GB; ⚠️ EXT4 variant required — EROFS does not boot on T860; VANILLA confirmed working by community)
  - [x] 05: SmartTube 32.10 arm64 + Brave arm64 APKs
  - [x] 01: stock firmware `SAMFW.COM_SM-T860_XAR_T860XXU5DXJ1_fac.zip` 6.28GB — downloaded, **MD5 verified** `79a605dc5f41bbd686d957368ecfb415` ✓
  - [ ] **MANUAL (Justin, XDA login required)**: `tabs6-gsi-fixes.zip` (341KB — storage/speakers/haptics fixes for Android 16 GSIs, flash in TWRP after every GSI update) from https://xdaforums.com/attachments/tabs6-gsi-fixes-zip.6367800/ (thread: xdaforums.com/t/….4796316/) → save to NAS folder 03
  - [ ] **MANUAL (Justin, XDA login required)**: multidisabler zip (encryption disabler, Mentalmuso flow) from https://xdaforums.com/t/….3919714/ → save to NAS folder 03
- Install guide to follow: Sage's LineageOS 23 GSI instructions — https://xdaforums.com/t/lineageos-23-android-16-gsi-instructions.4767423/ (uses this exact firmware page, TWRP 3.7.0, MisterZtr EXT4)
- Post-install notes from research: fingerprint never works on GSI (fine); exFAT microSD unsupported (reformat FAT32/ext4); enable Treble Settings → Samsung features → "extend brightness range"; TWRP may not see internal storage for dirty flashes — put system.img on SD card
- [ ] Download + stash stock firmware for recovery (SamFw/Frija) → `downloads/` (gitignored)
- [ ] Download TWRP for gts6l/gts6lwifi + patched vbmeta (XDA thread links below)
- [ ] Pick + download GSI image (arm64) from the Tab S6 GSI thread
- [ ] Back up anything on the tablet worth keeping (unlock = full wipe)
- [ ] Hardware: smart plug for 85% charge cycling, wall mount ideas, cable routing

### Phase 0.5 — Gaming PC prep (done 2026-08-16, via RDP from the Mac)
- [x] RDP working: Windows App on Mac → `rdp` local user on Justin_Gaming_PC (PIN/MSA can't RDP; dedicated local admin user created). Physical console stays on Justin's session.
- [x] Windows App reset: old Navy work account signed out, gov workspaces removed; only the gaming-PC connection remains
- [x] Flash kit copied NAS → `<pc>\S6 Tab (rdp user, unreadable — superseded)` (firmware zip verified 6.28GB)
- [x] Odin 3.14.4 extracted; Samsung USB driver v1.5.51 installed
- [x] Tablet USB detection: NOT visible under the `rdp` RDP session; works under Justin's console session but with flapping connect/disconnect toasts (marginal cable/port — rear USB 2.0 port + known-good cable to try). Both XDA zips staged (multidisabler built from ianmacd GitHub source, T860 support verified; tabs6-gsi-fixes.zip downloaded by Justin, verified, on NAS).
- **HANDOVER 2026-08-16**: flash execution moved to a Claude session running ON the gaming PC under Justin's own account (where USB works). Full instructions in `TURNOVER.md` on the NAS (`\\<nas>\media\Media\S6 Tab`); that session logs to `PROGRESS.md` alongside it — sync it back into this repo afterwards.
- Known quirk: synthetic typing into the RDP session garbles (every key → 'a'); workaround = Mac clipboard + ⌘V redirection, works reliably. Passwords always typed by Justin.

### Phase 1 — Flash weekend — ✅ COMPLETE 2026-08-16 (Windows-side session; full detail in docs/PROGRESS-windows-session.md)
Flashed: LineageOS 23.2 GSI (Android 16, VANILLA-EXT4) + multidisabler + tabs6-gsi-fixes. Bootloader unlocked, TWRP 3.7.0, **Magisk root**. Verified: boot, Wi-Fi, storage, haptics, brightness (Treble "extend brightness range"), color (SATURATED mode), SmartTube + Brave installed. Fixed post-flash: lock-screen "no service", battery %, SD-card format nag, adaptive-brightness RRO, battery charge cap.
Key corrections vs. earlier assumptions: fingerprint MAY work via Treble workaround (untested, irrelevant); HDR is permanently gone on a GSI (Samsung display HAL — only a One UI port restores it, not worth it); `warranty_bit` stays 0 until a custom binary flash, not at unlock; density 360 is correct; USB triage step 1 on Samsung = tablet's "Use USB for → File transfer" setting, not cables; `adb root` drops USB+wireless every time (Magisk root replaced it); wireless debugging pair/connect ports differ.
GSI updates: manual re-flash from MisterZtr releases (~15 min, data survives, re-flash fixes zip after; do NOT format data again).

### Phase 1 (original plan, for reference)
- [ ] Enable OEM unlocking → unlock bootloader (wipes device, blows Knox fuse — permanent)
- [ ] Odin: TWRP in AP + vbmeta, auto-reboot OFF
- [ ] TWRP: format data, flash GSI system.img
- [ ] First boot + hardware check: Wi-Fi, touch, speakers, brightness, sleep/wake, rotation
- [ ] Verify YouTube 1080p60 playback smooth (VP9, hardware decode, no thermal issues)
- [ ] Record what's broken vs working in the status log

### Phase 2 — Appliance setup (active to-do, 2026-08-16)
- [ ] Sign into SmartTube (Settings → Accounts, phone code) — fixes recommendations
- [ ] SmartTube: force VP9 + cap 1080p60 — avoid AV1 software decode
- [ ] Install F-Droid (Brave → f-droid.org) → Aurora Store (Anonymous session) → Proton Pass (require PIN on open — shared wall device)
- [ ] Optional: ReVanced YouTube + ReVanced GmsCore (revanced.app) if SmartTube's TV UI annoys
- [ ] Smart plug ~80% charge cap (battery swelling)
- [ ] Idle screen-off + dark UI habits (burn-in)
- [ ] On new MisterZtr GSI release: re-flash system image + tabs6-gsi-fixes.zip (~15 min, no data format)

### Phase 2 — original plan (reference)
- [ ] Sideload SmartTube; settings: force VP9, cap 1080p60, disable AV1
- [ ] Sideload browser
- [ ] Screen timeout / burn-in mitigations (dark UI, no static max-brightness content)
- [ ] Smart plug charge schedule (~30 min every few hours, hold battery near 60-85%)
- [ ] Verify InkyPi web UI reachable + usable from the tablet browser

### Phase 3 — Kiosk APK — ✅ DONE as **Inky OLED** (2026-08-16→18, Windows session), now `jtn0123/InkyPi/clients/android`
Built with SDK build-tools only (no Gradle), Java WebView shell + JS bridge, boot receiver, immersive mode,
burn-in drift, on-device settings, touch panels, Home Assistant tiles, timer, news, newspaper/picture widgets.
**Standalone by design (decided 2026-08-21): nothing from the Pi.** "True to InkyPi" = port plugins as JS widgets, same settings/playlist vocabulary, same data sources. Remaining items, tracked in the InkyPi PR:
- [x] Plugin parity: **Year** (year_progress + countdown) shipped 2026-08-21 on the clock line; parity table in clients/android/README.md
- [ ] Plugin parity: calendar (ICS, needs RRULE expander) next; then todo_list / ai_text
- [ ] Set as HOME/launcher; screen pinning
- [ ] Presence-based wake (mmWave → HA) — idea parked in tab-s6-kiosk README

### Phase 4 — InkyPi `panel` profile — ❌ DROPPED 2026-08-21
Superseded by the standalone decision: no server-side rendering for the tablet, no `/api/current_image` client, no `panel` display backend. Server work is limited to keeping `src/plugins/` as the reference for widget ports.

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-08-16 | GSI over One UI 7 port or debloated stock | Goal is removing Samsung layer entirely; T860/T865 has no official LineageOS device tree, GSI is the supported community path |
| 2026-08-16 | Vanilla GSI, no GMS/microG | Appliance use; SmartTube + sideloading covers everything; less junk |
| 2026-08-16 | SmartTube for YouTube | No GMS dependency, no ads, explicit codec picker avoids AV1 software decode on SD855 |
| 2026-08-16 | MP4/WebM loops instead of real GIFs | Hardware decoded, smaller, better quality |
| 2026-08-16 | Custom WebView kiosk APK over Fully Kiosk | Fits the project; boots straight into panel as launcher; Fully Kiosk remains fallback |
| 2026-08-16 | InkyPi server work is the LAST phase | Tablet must be flashed + stable first; panel can point at existing `/api/current_image` meanwhile |
| 2026-08-21 | **Tablet app is standalone — nothing streamed from the Pi** | Justin's call; Pi rendering would make the tablet a dumb screen. Port plugins as JS widgets instead; InkyPi `panel` profile dropped |
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
