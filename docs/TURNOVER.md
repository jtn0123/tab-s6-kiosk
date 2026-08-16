# Tab S6 Kiosk — Turnover Doc for the Windows Session

**Read this first.** You are a Claude session running on Justin's Windows gaming PC
(Justin_Gaming_PC), logged in as Justin's own account. Your job: execute the flash of a
Samsung Galaxy Tab S6 from prep through a booted GSI. All prep work is DONE — do not
re-download or re-verify anything unless a check fails. The human at the keyboard is
Justin — they handle all physical tablet actions (buttons, taps) and type all passwords.
Ask before anything destructive; the flash steps themselves are pre-authorized by Justin.

**Log everything you do** (steps completed, results, surprises) by appending to
`PROGRESS.md` in this same folder (create it if missing). The Mac-side session will sync
it into the project git repo later. Note that this folder lives on the NAS
(`\\10.27.27.196\media\Media\S6 Tab`, mapped from the Mac at `/Volumes/media/...`).

---

## Project context (1 minute)

Goal: wipe One UI from a 2019 Galaxy Tab S6 and run a clean Android 16 GSI, turning it
into a kitchen wall panel (later phases: WebView kiosk APK + InkyPi integration — NOT
your job today). Full tracker lives on the Mac at `~/Documents/Github/tab-s6-kiosk/PROJECT.md`.

Device facts (all confirmed):
- **SM-T860** (Wi-Fi, gts6lwifi), firmware T860XXS5DWH1, CSC **XAR**, **bootloader rev 5**
- **OEM unlocking toggle present** in Developer options — green light
- USB debugging enabled. Tablet already backed up; wipe is accepted.
- Knox fuse loss, Widevine L1→L3 loss: understood and accepted by Justin. YouTube unaffected.

## What's staged where

Everything is in this NAS folder AND mirrored at `C:\Users\rdp\Downloads\S6 Tab`
(readable by admins; Justin's account is admin — but if permissions annoy you, just
re-copy from the NAS share):

| Folder | Contents | Status |
|---|---|---|
| `01-stock-firmware-restore` | `SAMFW.COM_SM-T860_XAR_T860XXU5DXJ1_fac.zip` (6.28GB) | **MD5 verified** `79a605dc5f41bbd686d957368ecfb415` — emergency restore ONLY |
| `02-odin` | Odin 3.14.4 (extracted in the C: mirror) + Samsung USB driver | **Driver already installed** on this PC (v1.5.51, 2026-08-16) |
| `03-twrp-vbmeta` | `twrp-3.7.0_9-0-gts6lwifi.img.tar`, `vbmeta.tar`, `multidisabler-samsung-master-github.zip`, `tabs6-gsi-fixes.zip` | complete |
| `04-gsi` | `LineageOS-23.2-20260524-VANILLA-EXT4-GSI.7z` (0.9GB → ~2.5GB system.img) | **must be EXT4 variant — it is. EROFS does not boot on this device** |
| `05-apks` | SmartTube 32.10 arm64, Brave arm64 | sideload after first boot |

Windows 11 File Explorer extracts .7z natively (23H2+); otherwise use tar/7-Zip.

## Known USB situation (why this session exists)

- Under the separate `rdp` RDP account, the tablet never enumerated; under **Justin's own
  console session it connects** — but Justin reports flapping "USB connected/disconnected"
  toasts on the tablet. Cable carries data (else no toasts at all), but the link is marginal.
- **First task: stabilize USB.** Try a rear motherboard port (USB 2.0 preferred for Odin),
  a different/known-good USB-C cable, and check Device Manager for a stable entry
  (SAMSUNG Mobile USB / MTP device, no flapping). USB selective suspend is a suspect if
  flapping persists on a good cable+port.
- **Then dry-run download mode BEFORE unlocking anything:** tablet fully off → hold
  Vol Up + Vol Down → plug USB → warning screen → short-press Vol Up → download mode.
  Open Odin (`02-odin\Samfw.com_Odin3_v3.14.4\Odin3 v3.14.4.exe`): the ID:COM box must
  light up blue and STAY stable ~5 min. If it flaps, fix hardware before proceeding.
  Exit download mode harmlessly: hold Vol Down + Power until reboot.

## Flash procedure (in order — this follows Sage's guide, link below)

Battery >50% throughout. Never yank the cable mid-write.

1. **Unlock bootloader** (wipes tablet, blows Knox — pre-accepted):
   Dev options → OEM unlocking ON → power off → Vol Up + Vol Down + plug USB →
   long-press Vol Up → confirm unlock → device wipes. Complete minimal setup, CONNECT
   WI-FI (required so unlock sticks), re-enable Dev options, verify OEM unlocking greyed/on.
   Re-enable USB debugging while there.
2. **Odin: flash TWRP + vbmeta.** Download mode again. In Odin:
   - AP slot → `twrp-3.7.0_9-0-gts6lwifi.img.tar`
   - CP slot → `vbmeta.tar`  (yes, CP — per both community guides)
   - Options tab: **UNCHECK Auto Reboot**. Leave everything else default. Start → PASS.
   - Exit: hold Vol Down + Power, and the INSTANT the screen blanks switch to
     **Vol Up + Power to boot straight into TWRP recovery**. (Booting One UI first
     restores stock recovery and you redo step 2.)
3. **In TWRP** (Justin taps the tablet screen):
   - Wipe → Format Data → type `yes` (kills stock encryption; mandatory)
   - Reboot → Recovery once (clean slate), then:
   - Flash `multidisabler-samsung-master-github.zip` (push via `adb push file /sdcard/`
     from this PC — adb lives in platform-tools; install via winget if absent, or use
     TWRP's MTP which usually appears in Explorer)
   - Extract the GSI .7z → get `system.img` → push to /sdcard (or microSD)
   - TWRP: Install → Install Image → `system.img` → target **System Image**
   - Flash `tabs6-gsi-fixes.zip` (speakers/haptics/storage — REQUIRED on Android 16)
   - Wipe Dalvik/Cache → Reboot System. First boot takes several minutes.
4. **Verify** (log results in PROGRESS.md): boots to LineageOS setup, Wi-Fi, touch,
   ALL FOUR speakers, vibration, storage size correct, sleep/wake, auto-rotate,
   brightness (if capped low: Treble Settings → Samsung features → "extend brightness range").
5. **Post-boot:** sideload the two APKs from `05-apks` (`adb install file.apk`).
   SmartTube settings: force VP9, cap 1080p60 (SD855 has no AV1 hardware decode).
   Test a YouTube clip for smooth playback.

## If it goes wrong

- Bootloop/no boot → download mode always works: Odin → AP slot →
  the big firmware zip's contents (extract zip → load BL/AP/CP/CSC files into matching
  slots, use CSC_ not HOME_CSC_ for clean restore) → Start → back to stock One UI.
- Odin FAIL mid-flash → don't panic, don't reboot to system; re-enter download mode, retry.
- exFAT microSD is NOT readable by the GSI — FAT32/ext4 only.
- Fingerprint will never work on the GSI — known, accepted, irrelevant (wall panel).

## References

- Install guide followed: https://xdaforums.com/t/lineageos-23-android-16-gsi-instructions.4767423/
- GSI thread (T860/T865): https://xdaforums.com/t/aosp-rom-official-android-14-gsi-install-instructions-for-galaxy-tab-s6-sm-t860-sm-t865.4573383/
- Fixes thread: https://xdaforums.com/t/fix-gsi-sm-t860-t865-galaxy-tab-s6-storage-all-4-speakers-rotation-aware-and-haptics-on-android-16-gsis.4796316/
- GSI source: https://github.com/MisterZtr/LineageOS_gsi/releases (v2026.05.24-lineage23.2)

— prepared 2026-08-16 by the Mac-side session
