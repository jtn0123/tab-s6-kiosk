# Tab S6 Kiosk — Windows Session Progress Log

Session started 2026-08-16 ~13:10 on Justin_Gaming_PC, Justin's console account.
Appending chronologically. Times are local (24h).

---

## 13:10–13:20 — Environment checks (pre-flash)

**Staging folders on NAS: all present and correct sizes.**

| Folder | Verified |
|---|---|
| `01-stock-firmware-restore` | `SAMFW.COM_SM-T860_XAR_T860XXU5DXJ1_fac.zip` 6,747,458,637 B |
| `02-odin` | Odin 3.14.4 zip + Samsung driver zip |
| `03-twrp-vbmeta` | twrp .img.tar 67,082,240 B; vbmeta.tar 10,240 B; multidisabler 4,101 B; gsi-fixes 349,810 B |
| `04-gsi` | `LineageOS-23.2-20260524-VANILLA-EXT4-GSI.7z` 922,022,276 B (EXT4 variant confirmed by filename) |
| `05-apks` | Brave arm64 361,988,254 B; SmartTube 32.10 arm64 26,215,133 B |

**Corrections / notes vs TURNOVER.md:**
- `C:\Users\rdp\Downloads\S6 Tab` mirror is **not readable** from Justin's account (access denied).
  Worked around by staging a fresh local copy at **`C:\Users\Justin\S6Tab`** from the NAS. Use that path.
- Odin executable is actually named **`Odin3_v3.14.4_Samfw.com.exe`**, not `Odin3 v3.14.4.exe`.
  Full path: `C:\Users\Justin\S6Tab\02-odin\Samfw.com_Odin3_v3.14.4\Odin3_v3.14.4_Samfw.com.exe`
- adb IS installed: `C:\Users\Justin\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_.../platform-tools/adb.exe`,
  ADB 1.0.41 / 37.0.0-14910828. On PATH. No winget install needed.

**Samsung USB driver — CONFIRMED installed** (turnover was right):
- "SAMSUNG USB Driver for Mobile Phones" v1.5.51.0 in installed programs.
- Driver store has the full modern `ssud*` stack: `ssudbus.inf`, `ssudadb.inf`, `ssudmtp.inf`,
  `ssudmdm.inf`, `ssuddmgr.inf`, plus `ss_conn_usb_driver.inf`. Software side is not the problem.

**Flashable zips validated by opening the archives (not just size checks):**
- `multidisabler-samsung-master-github.zip` — valid zip, contains only
  `META-INF/com/google/android/update-binary` (9,132 B). This is correct: multidisabler ships as a
  single shell script in update-binary. Small size is expected, not a truncated download.
- `tabs6-gsi-fixes.zip` — valid zip, contains `android.hardware.vibrator-service.sysfs` (1.3 MB binary),
  its `.rc` + vintf manifest, and `phh-spkrot.sh` / `phh-spkrot.rc` for speaker rotation.
  Matches what the fixes thread describes (haptics + all-4-speakers + rotation aware).

---

## 13:12 — USB PROBLEM DIAGNOSED (task 1, blocking)

Tablet was plugged in but **did not enumerate**. `adb devices` empty; no SAMSUNG Mobile USB / MTP entry.

Root cause found in the PnP tree:

```
Unknown USB Device (Device Descriptor Request Failed)
InstanceId : USB\VID_0000&PID_0002\6&23491980&0&1
Status     : Error
Problem    : CM_PROB_FAILED_POST_START  (Code 43)
Location   : Port_#0001.Hub_#0004
Parent     : USB\ROOT_HUB30\5&b222599&0&0
Controller : AMD USB 3.10 eXtensible Host Controller - 1.20  (PCI\VEN_1022&DEV_15B7)
LocationPath: ACPI(_SB_)#ACPI(PCI0)#ACPI(GP17)#ACPI(XHC1)#ACPI(RHUB)#ACPI(PRT1)
FirstInstallDate: 2026-08-16 13:12:15
```

Interpretation: `VID_0000&PID_0002` is the placeholder Windows assigns when the **device descriptor
request itself fails** — Windows cannot even read who the device is. This is a physical-layer fault
(cable / port / connector / power), NOT a driver fault. Consistent with Justin's report of flapping
"USB connected/disconnected" toasts: the link comes up far enough to power-negotiate, then fails
enumeration and retries.

Currently on a **USB 3.x** port off the AMD 3.10 controller. Turnover's advice to prefer a rear
USB 2.0 port is the right move — the SD855 + Odin path is happier on USB 2.0, and 3.x SuperSpeed
signal integrity is the more likely thing a marginal cable fails at first.

Watcher script written to scratchpad (`usbwatch.ps1`) to detect enumeration changes in real time.

**NEXT: Justin to swap cable + move to rear USB 2.0 port. Awaiting.**

---

## 13:15–13:21 — Local staging complete + deep payload verification

Staged everything to `C:\Users\Justin\S6Tab`. GSI extracted with 7-Zip 26.02.

**Payloads verified by inspecting contents, not just file sizes:**

- **GSI filesystem confirmed EXT4 at the byte level** — read the raw image and checked the ext4
  superblock magic at offset `0x438`: reads `0xEF53` (correct). EROFS magic slot at offset 1024
  reads `0x00002220`, i.e. not EROFS. So this is genuinely the EXT4 variant, independently of the
  filename. This mattered — an EROFS image would have flashed fine and then never booted.
  Extracted image: `LineageOS-23.2-20260524-VANILLA-EXT4-GSI.img`, 2,733,260,800 B (2.55 GB).
- `twrp-3.7.0_9-0-gts6lwifi.img.tar` → single entry `recovery.img`, 67,080,192 B, dated Oct 15 2022. Correct for AP slot.
- `vbmeta.tar` → single entry `vbmeta.img`, 256 B, dated Aug 14 2019. Correct for CP slot
  (256 B is expected — it's a verification-disabled stub, not a truncated file).

## 13:16–13:21 — USB still NOT working (task 1 still blocking)

After Justin swapped to a **different cable and a different port**, state changed from
"Code 43 descriptor failure" to **nothing at all** — no Samsung device, no error device, no adb.

Two watcher runs confirm a stable absence, not a flap:
- 13:16:41, 25 s continuous poll: `BAD=0 GOOD=0 ADB=[]`, never changed.
- 13:18:40, 120 s continuous poll: `BAD=0 GOOD=0 ADB=[]`, never changed.

Tablet **is charging** — so VBUS/ground are fine; the fault is on the data pair or in the gadget config.

Justin reported the tablet's USB Preferences shows "USB controlled by: **Connected device**".
Advised: that is the CORRECT setting (PC = host, tablet = peripheral) and must NOT be changed to
"This device" (that is OTG host mode and would guarantee failure). The setting to change is the
separate **"Use USB for"** — if it is on "No data transfer"/charging-only, Android brings up the USB
gadget with zero functions, which produces exactly this signature: tablet charges, Windows sees
nothing. Awaiting Justin flipping that to "File transfer".

Contingency if "Use USB for" was already on File transfer: fault is hardware. Next diagnostic is to
test the cable + tablet against another host (or a data-capable charger) to separate a bad cable
from a worn USB-C jack on the tablet — common on a 2019 device.

**HARD GATE: do not begin bootloader unlock (task 3) until the link is proven stable.** An unlock
wipes the device; being stranded post-wipe with an unreliable USB link is the worst outcome available
in this plan. Dry-run download mode (task 2) must pass first, per turnover.

---

## 13:24 — USB RESOLVED. Root cause was the tablet's "Use USB for" setting.

**Not a hardware fault after all.** Tablet now enumerates cleanly and completely:

```
SAMSUNG Mobile USB Composite Device   USB\VID_04E8&PID_6860\R52M80LB8CE   Status OK
Justin's Tab S6            (WPD/MTP)  USB\VID_04E8&PID_6860&MS_COMP_MTP&SAMSUNG_ANDROID\...  Status OK
SAMSUNG Mobile USB Modem   (Modem)    USB\VID_04E8&PID_6860&MODEM\...                        Status OK
```

Zero problem devices in the whole PnP tree. **Device serial: `R52M80LB8CE`** (record this — it is
how we will identify the tablet in adb from here on).

Resolution sequence, for the record:
1. Original cable + USB 3.x port → Code 43, descriptor request failed (data lines present, marginal signal).
2. New cable + new port → total absence (no gadget presented).
3. Set tablet **"Use USB for" → File transfer**, leaving "USB controlled by" on **Connected device** → clean enumeration.

Lesson for the Mac-side doc: the "flapping connect/disconnect toasts" Justin originally saw were the
tablet cycling its USB gadget config, not a failing cable. Checking the tablet's own USB Preferences
should be step 1 of USB triage on Samsung devices, before touching cables and ports.

### Open sub-issue: USB debugging is OFF (turnover doc was stale on this point)

`adb devices` returns empty. Cause identified precisely: the composite device exposes **only**
MTP and Modem children — there is **no `AndroidUsbDeviceClass` / ADB interface at all**. If debugging
were merely un-authorized, the interface would still exist and adb would report the device as
`unauthorized`. Its total absence means USB debugging is disabled on the tablet.

TURNOVER.md states "USB debugging enabled" — that is no longer accurate as of this session.

---

## 13:24–13:27 — TASK 1 COMPLETE. adb authorized, device identity verified.

Watcher captured the exact transition:
```
13:23:53  BAD=0 GOOD=3 ADB=[]
13:24:13  BAD=0 GOOD=4 ADB=[R52M80LB8CE  unauthorized]   <- SAMSUNG Android ADB Interface appeared
(after Justin tapped Allow on the RSA prompt)
          adb: R52M80LB8CE  device  product:gts6lwifixx model:SM_T860 device:gts6lwifi
```

**Every hardware claim in TURNOVER.md independently confirmed from the device itself:**

| Property | Value | Turnover claim | Match |
|---|---|---|---|
| `ro.product.model` | SM-T860 | SM-T860 | yes |
| `ro.product.device` | gts6lwifi | gts6lwifi | yes |
| `ro.boot.bootloader` | T860XXS5DWH1 | T860XXS5DWH1 | yes |
| `ro.csc.sales_code` | XAR | XAR | yes |
| bootloader revision | 5 (the `S5` in T860XX**S5**DWH1) | rev 5 | yes |
| `ro.build.version.release` | 12 (SDK 32) | — | n/a |
| `ro.boot.flash.locked` | 1 | locked pre-unlock | yes |
| `ro.boot.warranty_bit` | 0 | Knox intact | yes |
| `ro.boot.verifiedbootstate` | green | — | n/a |

**Pre-flight checks:**
- `sys.oem_unlock_allowed = 1` — OEM unlocking IS enabled. Green light confirmed.
- `development_settings_enabled = 1`
- Storage: `/data` 110 G total, 89 G available (19% used). Ample.
- Battery temperature 30.8 C. Normal.

### BLOCKER: battery at 40%, below the >50% gate

```
level: 40 / scale: 100      status: 2 (charging)
AC powered: false           USB powered: true
```

Charging from the PC's USB port only (~0.5 A). A Tab S6 is 7040 mAh, so USB-only charging is far
too slow to be useful — this needs the Samsung AC wall charger.

Flash sequence is long (unlock -> wipe -> setup -> Odin -> TWRP format/flash -> GSI first boot,
call it 60-90 min) and GSI first boot is power hungry. Starting at 40% risks running the battery
down mid-migration, which is the failure mode the >50% rule exists to prevent.

**Plan proposed to Justin:** run the non-destructive Odin download-mode dry run (task 2) now, since
it takes ~5 min and proves the Odin path end to end; then move the tablet to the AC wall charger to
reach ~80% before starting the destructive unlock. USB link is now proven, so unplugging is safe.

**Justin's decision:** proceed with dry run and continue into the flash; tablet is charging over USB
and estimates ~50 min to 80%. Battery to be re-checked before the destructive unlock rather than
blocking on it.

---

## 13:30–13:36 — FRP / REACTIVATION LOCK CLEARED (issue not anticipated by TURNOVER.md)

Justin hit a prompt about needing to delete their Google account and asked whether the Samsung
account needed removing too. It did. **TURNOVER.md does not mention FRP or Reactivation Lock at all —
this is a gap in that doc and should be added to the Mac-side PROJECT.md.**

`adb shell dumpsys account` found **4 accounts** live on the device before removal:

```
Account {name=jtn0123@gmail.com,        type=com.google}                          -> arms FRP
Account {name=justin.neuhard@gmail.com, type=com.osp.app.signin}                  -> Samsung acct / Reactivation Lock
Account {name=justin.neuhard@gmail.com, type=com.samsung.android.mobileservice}   -> rides on Samsung acct
Account {name=Meet,                     type=com.google.android.apps.tachyon}     -> harmless
```

Why this mattered:
- **Google -> FRP.** Turnover step 1 requires booting back into One UI post-wipe and connecting Wi-Fi
  (needed for the unlock to stick). With FRP armed, the setup wizard demands the previously-synced
  Google credentials at exactly that moment.
- **Samsung -> Reactivation Lock.** More dangerous: with Reactivation Lock on, **Odin flashes are
  refused outright** (auth failure instead of PASS). This would have blocked step 2 of the flash.

Note: `settings global reactivation_lock_enabled` returns `null`, which does NOT mean the lock is off —
the key simply is not at that path. Reactivation Lock state is not exposed to adb in any namespace
(checked global/secure/system). It lives in Samsung secured storage + server side. The usable proxy
signal is `secure fmm_community_finding`.

**Could not remove the accounts from this side** — Android does not permit account removal over adb
on an unrooted device (no AccountManager access without root), and the Samsung removal requires
Justin's password. Deep-linked the tablet to the Accounts screen instead via
`adb shell am start -a android.settings.SYNC_SETTINGS`. Find My Mobile has no launchable activity
(`cmd package resolve-activity --brief com.samsung.android.fmm` -> "No activity found"), so its
toggle is reachable only through the Settings UI.

**Post-removal verification (from the device, not the UI):**
```
Accounts: 0                                (all four gone)
secure fmm_community_finding = 0           (was 1 -> Find My Mobile genuinely deregistered)
sys.oem_unlock_allowed       = 1           (still enabled)
battery level                = 43          (was 40, charging over USB)
```

FRP and Reactivation Lock risk cleared. Safe to proceed.

---

## 13:34–13:48 — TASK 2: download-mode dry run

### Attempt 1 (13:34:42) — INCONCLUSIVE, too short

Entered download mode via `adb reboot download` (cleaner than the button combo, non-destructive).
Device enumerated instantly as **`VID_04E8&PID_685D`** — the Samsung download-mode ID.

```
13:34:42  DownloadMode=True ifaces=2 allOK=True
          . OK  SAMSUNG Mobile USB CDC Composite Device
          . OK  SAMSUNG Mobile USB Modem #2
13:35:15  DROPPED  (Justin's deliberate Vol Down + Power exit)
```

Held only **33 s**. Zero spontaneous dropouts, but far short of the ~5 min the turnover asks for.
Not evidence of instability — just absence of the evidence we wanted. Justin elected to redo it properly.

**Watcher bug found and fixed:** the first `dlwatch.ps1` detected download mode by looking for a
`Ports`-class COM device. The download-mode gadget actually presents as **`USB` + `Modem`** classes,
never `Ports`, so the script would have reported a false "never detected". Rewritten to key off
`VID_04E8&PID_685D` directly. Worth keeping in mind for the Mac-side tooling.

### Attempt 2 (13:40:42) — entered via hardware buttons, adb not required

adb had gone `unauthorized` again after the reboot (the "always allow" tick did not persist) and
would not re-authorize even after `adb kill-server`/`start-server`; PC-side key was fine
(`adbkey.pub`, 723 B, dated 2026-05-19). **Did not chase it** — the pending unlock wipes the device
and destroys the authorization anyway, so it must be redone post-wipe regardless. Used the hardware
button sequence instead; the watcher detects download mode through the PnP tree, so adb is not needed
for this test.

```
13:39:27  DownloadMode=False
13:40:42  DownloadMode=True ifaces=1 allOK=True
13:40:43  DownloadMode=True ifaces=2 allOK=True
          . OK  SAMSUNG Mobile USB CDC Composite Device
          . OK  SAMSUNG Mobile USB Modem #2
(no further state changes — watcher logs only on change, so silence = no dropouts)
```

### Odin device detection — CONFIRMED

Justin could not initially find the ID:COM indicator. Resolved by pointing at the **`Log` tab**
instead, which prints an unambiguous **`Added!!`** line on detection. Justin confirms **"Added!!"
is present** -> Odin has detected the tablet and can claim it. This was the one part of the dry run
not observable from this session.

COM assignment for the download-mode device: `\Device\ssudmdm0000 -> COM4`
(`SAMSUNG Mobile USB Modem #2`, status OK).

Note on a diagnostic that did NOT work: tried proving Odin held the port by opening COM4 from
PowerShell. It opened successfully, which initially looked like "Odin has not claimed the device" —
but that inference is wrong. Odin appears to enumerate the port name without holding it open until a
flash actually begins, so an openable COM4 is consistent with a lit ID:COM. **The port-open test is
not a valid proxy for Odin detection**; use the Log tab's `Added!!` line. Recording this so the
Mac-side session does not repeat the mistake.

Also attempted to screenshot the Odin window via computer-use to read ID:COM directly — not possible:
Odin is a portable exe (not a Start-menu app, so `request_access` cannot resolve it) and it runs
elevated, which Windows UIPI blocks from lower-integrity control regardless.

### TASK 2 VERDICT: PASS

```
Download mode entered : 13:40:42
Checked at            : 13:45:44
Held continuously     : 303 s (5.0 min)
Interfaces            : 2/2, both Status OK, for the entire window
Spontaneous dropouts  : 0
Odin detection        : "Added!!" present in Odin Log tab
```

Meets the turnover's "~5 min stable" requirement. USB link is proven end to end: enumeration,
stability under a 5-minute idle hold, and Odin's ability to claim the device. Cleared to flash.

---

## ~13:48 — TASK 3: BOOTLOADER UNLOCKED. Point of no return crossed.

Justin performed the unlock (long-press Vol Up at the warning screen) and reports the bootloader is
unlocked and the device is erasing. Battery was charging; Justin elected not to gate on the level.

**Irreversible from here:** Knox fuse blown, Widevine L1 -> L3. Both pre-accepted per TURNOVER.md.

Post-wipe setup instructions given to Justin:
- **Connect Wi-Fi — mandatory.** Unlock does not durably stick without the network check-in; skipping
  it risks the bootloader silently re-locking on next boot and forcing a repeat of the wipe.
- **Do NOT re-add Google or Samsung accounts** — that would re-arm FRP and Reactivation Lock, undoing
  the 13:30-13:36 work, before the Odin flash.
- Re-enable Developer options (Build number x7) + USB debugging; re-authorize adb.

**Pending verification once adb is back** (these prove the unlock actually took):
```
ro.boot.flash.locked      expect 0       (was 1)
ro.boot.warranty_bit      expect 1       (was 0 — Knox now tripped)
ro.boot.verifiedbootstate expect orange  (was green)
```

### Unlock verified from device (post-setup, adb re-authorized)

```
ro.boot.flash.locked      = 0        CONFIRMED UNLOCKED
ro.boot.verifiedbootstate = orange   CONFIRMED UNLOCKED
sys.oem_unlock_allowed    = 1
ro.boot.warranty_bit      = 0        <-- still 0, see note
Accounts: 0                          Justin correctly did not re-add accounts
battery level             = 46 (charging)
```

**Correction to my own prediction:** I expected `warranty_bit` to flip to 1 at unlock. It did not.
On this device Knox trips when a **custom binary is actually flashed**, not at unlock time, so it
stays 0 until the TWRP flash. The two authoritative unlock indicators (`flash.locked=0`,
`verifiedbootstate=orange`) both read correctly, so the unlock is genuinely in place. Worth noting in
PROJECT.md so nobody reads `warranty_bit=0` as "the unlock didn't take".

---

## 14:01–14:04 — TASK 4 COMPLETE: TWRP + vbmeta flashed via Odin

**Auto Reboot handled programmatically rather than by hand.** Odin stores it in `Odin3.ini` under
`[APOption]`. Force-killed Odin (so it could not write the ini back on exit), set `AutoReboot=1` -> `0`,
relaunched elevated. Final safe state confirmed in the file:
```
RePartition=0   AutoReboot=0   FResetTime=1   NandErase=0
```
Justin visually confirmed in the Options tab: only F. Reset Time enabled, everything else off.

**Note for the Mac-side session — Odin cannot be automated from a Claude session on this box.**
Two independent blockers: (1) Odin is a portable exe with no Start-menu entry, so computer-use
`request_access` returns `notInstalled` and cannot resolve it; (2) it runs elevated, and Windows UIPI
blocks synthetic input from a lower-integrity process into an elevated one. The `.ini` is the only
programmatic lever. AP/CP file selection must be done by hand.

Flash window was clean — watcher logged download mode 14:01:52 -> 14:03:31 (99 s) with **zero**
dropouts; the drop at the end was Justin's deliberate exit to TWRP.

Exit-to-TWRP button handoff (Vol Down+Power, then instantly Vol Up+Power) succeeded first try.

## 14:04–14:20 — TASK 5 COMPLETE: format, multidisabler, GSI, fixes

TWRP came up and adb saw it directly — **no RSA authorization needed in recovery**:
```
R52M80LB8CE   recovery   product:omni_gts6lwifi   model:SM_T860
```

TWRP's first-run prompt asks about keeping the system partition unmodified. **Swipe to Allow
Modifications** is required — "Keep Read Only" would have blocked the format, the multidisabler and
the system image write. (Not mentioned in TURNOVER.md; add to PROJECT.md.)

**Format Data succeeded and decryption is confirmed** — `/data` remounted clean:
```
/dev/block/sda30 on /data   type f2fs (rw,...)
/dev/block/sda30 on /sdcard type f2fs (rw,...)
110G total, 1.7G used, 108G available
```

**Files pushed and verified byte-exact on device:**
```
/sdcard/LineageOS-23.2-20260524-VANILLA-EXT4-GSI.img   2,733,260,800   exact match to source
/sdcard/multidisabler-samsung-master-github.zip                4,101   exact
/sdcard/tabs6-gsi-fixes.zip                                  349,810   exact
```
Push ran at **154.6 MB/s, 16.9 s** for the 2.55 GB image — the tablet is on a USB 3.x port, not USB 2.0.
(I had predicted "a few minutes"; it was seconds. Worth knowing: pushing the GSI is not a bottleneck.)

Flash order executed: multidisabler zip -> Install Image -> **System Image** target -> gsi-fixes zip ->
Advanced Wipe (Dalvik/ART Cache + Cache only) -> Reboot System.

**UI gotchas hit, worth documenting for next time:**
- TWRP's normal Install filters to `.zip` only; the GSI `.img` is invisible until you tap
  **Install Image**. Conversely, while in image mode the zips vanish — tap **Install Zip** to get back.
  Justin hit this looking for `tabs6-gsi-fixes.zip`.
- All three files sit loose at the top level of `/sdcard`, no subfolder.
- Target partition selection is the one genuinely dangerous tap: must be **System Image**, not Boot
  (kernel) or Recovery (would overwrite TWRP).

**FIRST BOOT SUCCEEDED.** Device booted through to the LineageOS setup wizard.

Remaining: task 6 — setup wizard (Wi-Fi, no accounts), hardware verification, APK sideload.

---

## 14:25–14:35 — TASK 6: post-boot verification

Setup wizard completed with Wi-Fi connected and **no accounts added** (deliberate — re-adding Google
or Samsung would re-arm FRP / Reactivation Lock). Developer options + USB debugging re-enabled,
adb re-authorized.

### OS identity — confirmed as intended

```
ro.lineage.version        = 23.2-20260524-VANILLA-EXT4-GSI
ro.lineage.build.version  = 23.2
ro.build.version.release  = 16          (Android 16)
ro.build.version.sdk      = 36
ro.build.flavor           = lineage_arm64_bvN4-userdebug
ro.treble.enabled         = true
ro.product.system.model   = SM-T860
```

Note `userdebug` — **`adb root` is available on this build** (gated behind a Developer options
toggle), so root-level inspection does not require Magisk.

### tabs6-gsi-fixes.zip — verified at the SERVICE level, not just file presence

All five payload files present in `/vendor` and `/system`. More importantly the services are live:
```
init.svc.phh-spkrot            : running    <- 4-speaker + rotation-aware audio
init.svc.vendor.vibrator-sysfs : running    <- haptics HAL
init.svc.sec-vibrator-2-2      : running
```
Files landing without services starting is a real failure mode; checked both.

### Storage / battery
```
/data  110G total, 105G free    (correct size — GSIs sometimes mis-report this)
battery 57% and charging
```

### APKs sideloaded
```
SmartTube_stable_32.10_arm64-v8a.apk  -> Success    package: org.smarttube.stable
BraveMonoarm64.apk                    -> Success
```
**Package name gotcha:** SmartTube installs as **`org.smarttube.stable`**, NOT
`com.liskovsoft.smarttubetv.beta`. Launch with:
`adb shell monkey -p org.smarttube.stable -c android.intent.category.LAUNCHER 1`

### Haptics — CONFIRMED WORKING

`cmd vibrator` fails ("Can't find service") because Android 16 renamed it to `vibrator_manager`;
`cmd vibrator_manager vibrate` also rejects that subcommand. Neither indicates a fault. Proof came
from the vibration history instead:
```
14:31:37.551 | effect | finished | duration: 75ms | usage: TOUCH | com.android.systemui
played: [Step=10ms(amp=0.04),Step=20ms(amp=0.12),Step=20ms(amp=0.20),Step=10ms(amp=0.04)]
```
Repeated real amplitude ramps driven by UI touches. Samsung HALs registered:
`vendor.samsung.hardware.vibrator@2.0/2.1/2.2::ISehVibrator/default`.

### Speakers — strong indirect confirmation, listening test outstanding

`phh-spkrot` logged `rotation 1`, matching current `mRotation=1`. This is meaningful because the
script guards itself:
```sh
tinymix "$FL" >/dev/null 2>&1 || exit 0   # no-op on non-CS35L41 hardware
```
It exits immediately if the quad-amp mixer is absent. Still running and logging rotation changes ->
all four Cirrus CS35L41 amps found and being driven.

Could **not** read the mixer directly: `tinymix` returns "Failed to open mixer" as the shell user.
The script runs as root from init; the adb shell user lacks ALSA mixer permission. Needs `adb root`.

---

## DISPLAY INVESTIGATION (significant — not covered by TURNOVER.md)

Justin reported the display looked **dim and flat**, noting the panel was the best part of the stock
device. Three distinct problems, with different outcomes. Worth reading before assuming a GSI
"ruined" a Samsung AMOLED.

### Problem 1: brightness capped — FIXED

```
system screen_brightness      = 255     <- already pegged at max
system screen_brightness_mode = 0       <- auto-brightness off, so not sensor dimming
```
Slider at maximum and still dim => HAL-level cap, not a user setting. Fixed by the toggle TURNOVER.md
flagged: **Treble Settings -> Samsung features -> "extend brightness range"**.

**Treble Settings has NO launcher icon on this build.** Justin could not find it in the app drawer.
The package is installed (`me.phh.treble.app`) but `resolve-activity` returns "No activity found".
Launch it directly:
```
adb shell am start -n me.phh.treble.app/.TopLevelSettingsActivity
```
(other entry point: `me.phh.treble.app/.SettingsActivity`)

Result: Justin reports **"much better"**. Post-fix `screen_brightness = 84` — i.e. the toggle
remapped the scale, and the device now sits at 84/255 with roughly 3x headroom remaining where it
was previously maxed out and still dim.

### Problem 2: colour flat / undersaturated — IMPROVED

```
supportedColorModes = [NATIVE(0), SRGB(7), DISPLAY_P3(9)]
Device supports wide color: 1
Current color mode  = SRGB (7)          <- clamped to sRGB on a P3-capable AMOLED
```
Set `adb shell settings put secure display_color_mode 2` (SATURATED). Result is partial and worth
understanding: a vendor mode engaged (`Current Color Mode: OEM_VIVID`) while the compositor stayed
`ColorMode::SRGB (7) renderIntent=ENHANCE`. Those two layers can legitimately disagree — the vendor
mode drives the panel, the compositor governs how app content maps into it.

Values: `0`=Natural `1`=Boosted `2`=Saturated (current) `3`=Automatic.
Revert with `adb shell settings delete secure display_color_mode`.

### Problem 3: HDR — NOT AVAILABLE, and not recoverable on a GSI

The panel advertises HDR, which misleads:
```
hdrCapabilities: mSupportedHdrTypes=[2,3,4]     (HDR10, HLG, HDR10+)
                 mMaxLuminance=564.3 nits
```
But the pipeline is inert, and stayed inert after the brightness fix:
```
mHdrBrightnessData     = null
mMaxDesiredHdrRatio    = 1.0            <- decisive: zero HDR headroom
hdrSdrRatio            = NaN / not_available
PreferredHdrOutputType = HDR_TYPE_INVALID
mMode                  = NO_HDR
```
`mMaxDesiredHdrRatio = 1.0` is the key value. HDR requires highlights to exceed the SDR white point
(ratio > 1.0); at exactly 1.0 the compositor has no headroom and tone-maps HDR content down to SDR.
That luminance curve comes from Samsung's device-specific display HAL, which is not in a generic
system image. **No setting, overlay, or Magisk module reconstructs it.**

**Net:** the two problems that actually dominate day-to-day perception (brightness, saturation) are
fixed. HDR video playback is the genuine, permanent casualty of the GSI route on this device.

---

## REFERENCE: OS updates and customisation (discussed with Justin)

### Does this get OS updates? No — not automatically.

This is a **GSI**, not an official LineageOS device build. The Tab S6 has not been officially
supported for years, which is why the GSI route exists.

- **No OTA.** The Updater app will not find anything.
- **Updating = manual re-flash.** New builds appear at
  https://github.com/MisterZtr/LineageOS_gsi/releases . Procedure: download `.7z`, boot TWRP,
  Install Image -> **System Image**, **re-flash `tabs6-gsi-fixes.zip`**, wipe Dalvik/cache, reboot.
  ~15 minutes.
- **Do NOT format data again** — that was a one-time step to remove Samsung encryption. User data
  survives a system image update.
- **A system update overwrites `/system` wholesale.** Anything edited directly in `/system` is lost
  every update. Persistent customisations must live in `/data` (Magisk modules, installed RRO
  overlay APKs) to survive.

### Customisation tiers, easiest first

1. **Settings / adb — no root, no build.** Covers more than expected.
   `adb shell wm density 300` (current is **360**; panel's true density is ~287 dpi, so 360 renders
   larger than 1:1 — Samsung stock ran ~300). `wm density reset` to undo. Also `wm size`.
   Most kiosk behaviour (orientation lock, timeout, stay-awake) is `adb shell settings put`.
2. **Treble Settings** (`me.phh.treble.app`) — a whole app of device-quirk toggles, already the
   source of the brightness fix. **First place to look for any hardware oddity.**
3. **RRO overlays** — moderate effort. Build a small APK that overrides framework `config_*` values.
   The correct way to fix device-specific behaviour on a GSI; survives system updates (lives in /data).
4. **Full source build** — ~200 GB, hours per build. Only if no overlay can reach the thing.

Magisk is not installed but can be added later; modules live in `/data` and reapply after updates.

### Is a device-specific port worth it?

Concrete answer, using HDR as the test case: brightness and colour were recoverable on the GSI and
are now fixed. HDR requires Samsung's display HAL and vendor display blobs — that is a tier-4
device-tree/kernel port. **Assessment: not worth it for a kitchen wall panel** running a dashboard
and occasional video. The perceptual wins are already banked; the remaining gap is HDR playback on a
wall-mounted tablet. Recommended path is to re-flash new GSIs as they ship (~15 min) rather than
maintain a build.

Favourable factor if anyone ever reconsiders: SM-T860 is **Snapdragon 855** (`ro.boot.hardware=qcom`),
and Qualcomm devices are substantially easier to build for than Exynos.

---

## 14:35–15:33 — Root attempt, connection loss, SESSION PAUSED

### Connectivity trouble while enabling root

Justin enabled Root access / Rooted debugging in Developer options. `adb root` responded
`restarting adbd as root` — then **the tablet vanished from USB entirely**: no `VID_04E8` device,
no error device, nothing in the PnP tree. Same signature as the 13:16 problem (gadget presenting no
USB functions), not a hardware fault.

**Worked around with wireless debugging.** For the record, since this is now the more reliable path
on this setup:
```
adb pair 10.27.27.61:38205 240525
  -> Successfully paired to 10.27.27.61:38205 [guid=adb-R52M80LB8CE-j54a1b]
adb mdns services
  -> adb-R52M80LB8CE-j54a1b  _adb-tls-connect._tcp  10.27.27.61:34021
(mDNS auto-connected; state went to `device`)
```
Gotcha: the **pairing port and the connect port are different** (38205 vs 34021), and Android
pairing codes are **6 digits** — a 7-digit transcription produced
`error: protocol fault (couldn't read status message)`, which is a misleading error for "wrong code".

### `adb root` kills the connection either way — known behaviour now

Running `adb root` over the wireless session dropped it too: mDNS went empty and the connect port
actively refused. Restarting adbd tears down the TLS wireless session and Android generally switches
**Wireless debugging off** in the process.

**Implication for next session:** do not call `adb root` casually — it drops USB *and* wireless every
time. Reconnect first and check whether adbd is *already* root (`adb shell id` -> `uid=0`) before
forcing another restart. The resume script below does exactly this.

### Session paused — Justin stepped away from the computer

Tablet is currently unreachable (no USB, no wireless), so all remaining verification is blocked.
**Nothing is at risk:** the flash is complete, the OS is healthy and booted, and both APKs are
installed. Only diagnostics are outstanding.

### Resume script written

**`C:\Users\Justin\S6Tab\resume-verification.ps1`** — run it once the tablet is reconnected. It:
- refuses to run if not connected, and prints reconnection instructions in its header
- checks whether root is already active instead of forcing an adbd restart
- dumps density/resolution, brightness, colour mode, HDR pipeline state, fixes-zip services,
  spkrot log, auto-rotate, sleep/wake, battery, installed packages
- if (and only if) root is already active, additionally reads the four CS35L41 amp slot positions
  and the panel's real `max_brightness` ceiling

Reconnect first:
- **USB:** plug in, then set "Use USB for -> **File transfer**" on the tablet.
- **Wireless:** enable Wireless debugging, then `adb mdns services` for the new port and
  `adb connect 10.27.27.61:<port>`. **Already paired — no re-pairing needed.**

---

## OUTSTANDING AT SESSION PAUSE

| Item | Status |
|---|---|
| All four speakers | **Unverified.** Needs either a listening test (cup each corner while audio plays; rotate to confirm L/R follows) or root for the `tinymix` readout. Strong indirect evidence they work — `phh-spkrot` self-exits without the quad-amp mixer and it is running and logging rotations. |
| Auto-rotate | Unverified |
| Sleep / wake | Unverified |
| Panel brightness ceiling | Unverified (needs root) |
| SmartTube VP9 + 1080p60 cap | **Not configured.** Required — SD855 has no AV1 hardware decode, so leaving it unset means software decode and stutter on newer videos. |
| YouTube playback smoke test | Not done |

Everything destructive and irreversible is complete and verified. What remains is configuration and
confirmation only.

---

## RESEARCH: available patches, HDR, fingerprint, newer OS (2026-08-16, ~15:40)

Justin asked whether patches exist for better audio, HDR, fingerprint, or a newer OS.
**Caveat on all XDA-sourced claims below: xdaforums.com returns HTTP 403 to automated fetches, so
these come from search-result summaries, not the threads themselves. Verify before flashing.**

### 1. Audio quality — UNTRIED TOGGLES EXIST (free, do these first)

Documented phh levers for this exact device that this session never touched:
- **Treble Settings -> Qualcomm -> alternate audio policy**
- **Treble Settings -> Samsung -> alternate audio + stereo**

Reported as the primary method for fixing/improving Tab S6 audio on GSIs. No reflash, reversible.

### 2. Fingerprint — TURNOVER.md IS LIKELY WRONG

TURNOVER.md states "Fingerprint will never work on the GSI — known, accepted". A documented
workaround exists:
- **Treble Settings -> Samsung features -> Workarounds -> "Enable workaround for broken fingerprint sensor"**
- Fallback: **Treble Settings -> Miscellaneous -> "Treat virtual sensors as real"** (reboot after)

Untested on this device. Irrelevant to the wall-panel use case but cheap to try.
**Recommend correcting that line in PROJECT.md.**

### 3. HDR — NO GSI-SIDE FIX EXISTS

Searched specifically. Nothing found. Confirms the 14:35 diagnosis: `mHdrBrightnessData` /
`mMaxDesiredHdrRatio=1.0` originate in Samsung's display HAL, and no GSI patch, overlay or module
reconstructs that luminance curve. **The only route to HDR on this hardware is a Samsung-based ROM.**

### 4. Newer OS — ALREADY ON THE NEWEST

- **`v2026.05.24-lineage23.2` (what we flashed) is still the latest MisterZtr release.** Prior:
  05.07, 05.04, 04.25, 04.18. Nothing newer to move to.
- Variants offered: EXT4/EROFS x GAPPS/VANILLA. (We correctly took VANILLA-EXT4.)
- **LineageOS 24 / Android 17:** `lineage-24.0` branch commits began 2026-06-21, mostly still open,
  only some Pixel commits merged, **no release timeline and no GSI**. Not an option for months.
- Relevant changelog line explaining our colour-mode experiment:
  *"Kept only natural and adaptive color profiles by default, as other incorrect profiles can cause
  UI lags on some devices."* MisterZtr deliberately pruned the profile list — this is why
  `display_color_mode` behaved only partially.

### 5. The only HDR route: One UI ports for SM-T860

| Port | Released | Notes |
|---|---|---|
| **One UI 7 / Android 15** | **2026-08-01** (Odin fix 08-03) | Single Odin AP package. Reported broken: **Bluetooth speaker audio**, AirPods silent, SD card format issues, S Pen settings absent |
| **One UI 6 / Android 14** | earlier | Thread claims *"All hardware working except fingerprint, quad-speaker fix included"*; more mature |

These ship Samsung's real display HAL, so HDR + Samsung audio processing + full brightness return.

**ASSESSMENT: not recommended for this project.** Trades Android 16 for 15, reintroduces One UI —
the thing the project existed to remove — and the newest port has **broken Bluetooth speaker audio**,
a real problem for a kitchen device. The gain is HDR video playback on a wall-mounted dashboard.
Bad trade. Note also that even the mature One UI 6 port lists fingerprint as broken, so a One UI port
is not the fix for that gap either.

### Recommended next actions (cheapest first)
1. Try the two Treble audio toggles (Qualcomm alternate audio policy; Samsung alternate audio + stereo)
2. Try the Treble fingerprint workaround — settles the TURNOVER.md claim either way
3. Consider `wm density 300` (currently 360; panel is ~287 dpi native, Samsung stock ran ~300)
4. Stay on LineageOS 23.2 GSI; re-flash new MisterZtr builds as they ship (~15 min, data preserved)
5. Revisit only if LineageOS 24 ships a GSI

---

## HDR EXPERIMENT — VALIDATED IN AN ANDROID 16 EMULATOR (2026-08-16, 15:45–16:10)

Justin asked whether specific driver pieces could be ported rather than a whole ROM, then asked for
as much emulation/debugging as possible before touching the device. Both were done. **This section
supersedes the earlier "HDR is not recoverable" conclusion — it is more nuanced than that.**

Artifacts: `C:\Users\Justin\S6Tab\hdr-research\`
(XSD, DisplayDeviceConfig.java, HdrBrightnessData.java, analyze_schema.py, test XMLs)

### The mechanism — traced to AOSP source, not guessed

`mHdrBrightnessData=null` and `mMaxDesiredHdrRatio=1.0` are **the documented no-config defaults**:
```java
getFallbackData(hbm = null)         -> return null;   // == our mHdrBrightnessData
getFallbackHighestSdrHdrRatio(null) -> return 1;      // == our mMaxDesiredHdrRatio
```
Supplying `<sdrHdrRatioMap>` inside `<hdrBrightnessConfig>` bypasses the HBM fallback entirely, so
**no `highBrightnessMode` block is needed**.

File resolution (`DisplayDeviceConfig`), tried in order under each of /product,/vendor,/odm,/system:
```
ETC_DIR="etc"  DISPLAY_CONFIG_DIR="displayconfig"  CONFIG_FILE_FORMAT="display_%s.xml"
  1. display_id_<physicalDisplayId>.xml     (STABLE_ID_SUFFIX_FORMAT = "id_%d")
  2. display_<physicalDisplayId & ~(1<<62)>.xml   (NO_SUFFIX_FORMAT = "%d")
  3. display_port_<port>.xml                (PORT_SUFFIX_FORMAT = "port_%d")
```
**Tab S6 reports `address {port=129}` -> target file is `display_port_129.xml`.**

### Emulator test setup

Android Studio SDK was already installed. Added `system-images;android-36-ext19;google_apis;x86_64`,
created AVD `hdrtest`, booted headless with `-writable-system`.

**Baseline was byte-identical to the Tab S6** — a genuine reproduction:
```
mLoadedFrom = <config.xml>     mHdrBrightnessData = null     mMaxDesiredHdrRatio = 1.0
```

### Finding 1 — the "27 required elements" fear was WRONG

The XSD declares ~27 children of `<displayConfiguration>` without `minOccurs="0"`, implying a huge
mandatory file. **Not true in practice.** AOSP's own shipped
`/system/etc/displayconfig/default_television.xml` contains **only `<densityMapping>`**. The
xsdc-generated parser is lenient; missing elements become null and are handled per-field.

Corollary: the AOSP XSD is **not strict-valid** and cannot be used for offline validation —
lxml rejects it with `Element 'xs:annotation': attribute 'name' is not allowed` (Google uses
non-standard annotations for codegen). So there is no schema-validation safety net.

### Finding 2 — a minimal file WORKS (positive test PASSED)

Pushed a `display_port_0.xml` containing only `<hdrBrightnessConfig>`. After reboot:
```
mLoadedFrom = /vendor/etc/displayconfig/display_port_0.xml
mHdrBrightnessData = HdrBrightnessData {
    mMaxBrightnessLimits: {0.0=0.5, 500.0=0.8, 1500.0=1.0},
    sdrToHdrRatioSpline: LinearSpline{[(2.0,4.0), (300.0,1.8), (500.0,1.1)]},
    highestHdrSdrRatio: 4.0 }
HdrBrightnessModifier: mMaxBrightness = 0.8    <- our brightnessMap actively APPLIED
```
Booted first try, no parse errors. **null -> fully populated.** Mechanism confirmed end to end.

### Finding 3 — a wrong file HARD BOOTLOOPS (negative test PASSED)

Removed one element (`<brightnessIncreaseDebounceMillis>`) and rebooted. Result after 5 minutes:
never reached `boot_completed`. logcat:
```
FATAL EXCEPTION IN SYSTEM PROCESS: android.display
java.lang.NullPointerException: 'long java.math.BigInteger.longValue()' on a null object reference
  at com.android.server.display.config.HdrBrightnessData.loadConfig(HdrBrightnessData.java:200)
  at com.android.server.display.DisplayDeviceConfig.initFromFile(DisplayDeviceConfig.java:1895)
  at com.android.server.display.LocalDisplayAdapter$LocalDisplayDevice.loadDisplayDeviceConfig(...)
```
Deleting the file restored normal boot immediately.

**Root cause:** `initFromFile` catches only `IOException | DatatypeConfigurationException |
XmlPullParserException`. An NPE is none of those, so it propagates into system_server.
`initFromFile` also `return true`s after a caught parse error, so the `config.xml` fallback never
runs either.

**MANDATORY children of `<hdrBrightnessConfig>` (each dereferenced with no null check):**
`brightnessMap`, `brightnessIncreaseDebounceMillis`, `brightnessDecreaseDebounceMillis`,
`screenBrightnessRampIncrease`, `screenBrightnessRampDecrease`.
`allowInLowPowerMode`, `sdrHdrRatioMap`, and the `minimumHdrPercentOfScreenFor*` pair are optional.

### Finding 4 — what the emulator CANNOT settle

```
emulator display: mSupportedHdrTypes = []      <- advertises NO HDR at all
HdrBrightnessModifier: mHdrLayerSize = -1.0, mMode = NO_HDR, mMaxDesiredHdrRatio = 1.0
```
`mMaxDesiredHdrRatio` is a **runtime** value, computed only when an HDR layer is actually being
composited — not a static config value. The emulator can never produce one.

**The Tab S6 advertises `mSupportedHdrTypes=[2,3,4]`, so this specific blocker does not apply there.**
This also means the original tablet reading of `mMaxDesiredHdrRatio=1.0` was measured with no HDR
content playing and was partly a red herring — though with `highestHdrSdrRatio` capped at 1 by the
missing config, it could never have risen regardless.

### Status and the honest bottom line

**Proven:** the file loads, parses, populates HdrBrightnessData, is consumed by HdrBrightnessModifier,
does not bootloop when correct, bootloops hard when wrong, and is fully reversible by deletion.

**Unproven:** whether the Tab S6's composer actually engages HDR and boosts highlights. Only testable
on the device with real HDR content.

**Ready-to-use file: `C:\Users\Justin\S6Tab\hdr-research\display_port_129.xml`**, tuned to the panel's
real 564.3-nit ceiling, with all five mandatory children present and heavy inline warnings.

**RECOVERY PLAN IF IT BOOTLOOPS — read before installing:** boot TWRP (Vol Up + Power) and delete
`/vendor/etc/displayconfig/display_port_129.xml`. **Do not count on adb** — adb authorization depends
on system_server, which is the process crashing. (adb root stayed usable through the emulator
bootloop, but the emulator is permanently rooted-and-authorized; the tablet is not.)
Installing it needs root or a TWRP-side write, since `/vendor` is read-only at runtime. Like the
fixes zip, a GSI update wipes it.

---

## SYSTEMATIC ELEMENT-SAFETY MATRIX + PATCH SET (2026-08-16, 16:10–16:45)

Justin asked to flesh this out, debug further, find other bake-able patches, and keep them
separate. Built a reboot-cycling test harness (`hdr-research/test-harness.ps1`) and ran six
cases through the Android 16 emulator, then packaged results as four independent patches.

### Results — all six cases booted, zero crashes

| Case | Boot | HDR data | highestHdrSdrRatio | Density |
|---|---|---|---|---|
| 01 densityMapping only | OK | absent (no block) | — | **160 -> 200** |
| 02 hdrBrightnessConfig only | OK | populated | **4.0** | 160 |
| 03 density + HDR together | OK | populated | **4.0** | **200** |
| 04 autoBrightness only | OK | absent (no block) | — | 160 |
| 05 deliberately wrong element order | OK | populated | **4.0** | **200** |
| 06 HDR minus `sdrHdrRatioMap` | OK | populated | **1.0** | 160 |

**Harness bug, found and corrected:** the matcher tested `if ($hdr -match 'null')`, but a
correctly populated line legitimately contains `sdrToHdrRatioSpline: null`. Case 06 was
initially misreported as "null" — the full dump shows it populated with
`sdrToHdrRatioSpline: null, highestHdrSdrRatio: 1.0`, exactly as the source predicts.
Recording this so nobody re-reads the raw harness output and draws the wrong conclusion.

### What the matrix establishes

1. **`sdrHdrRatioMap` is precisely and solely the element that supplies HDR headroom.**
   Case 06 vs 02 isolates it: same block, one element removed, ratio drops 4.0 -> 1.0. Everything
   else in `hdrBrightnessConfig` governs brightness limiting and ramping.
   **A config without it is valid, boots, and does nothing for HDR** — that is the tablet's
   current state expressed as a file.
2. **Density is settable via displayconfig and is safe** (160 -> 200 verified).
3. **Density and HDR coexist cleanly** (case 03). This matters because Android loads exactly
   ONE display config per display, so they cannot be separate files.
4. **Element order is irrelevant** (case 05). The xsdc parser is order-tolerant, so a
   hand-assembled combined file is robust. (AOSP's own `default_television.xml` already hinted
   at this — it puts `<height>` before `<width>`, against the schema's declared order.)
5. **`autoBrightness` parses safely on its own** — no NPE path found. Viable if night-dimming
   is ever wanted.

### Patch set — `C:\Users\Justin\S6Tab\patches\`

Four independent patches, each using a different mechanism so each can be applied or reverted
alone. Full detail in `patches/README.md`.

| # | Patch | Mechanism | Root? | Risk | Survives GSI update? |
|---|---|---|---|---|---|
| **C** | Treble toggles (audio, fingerprint, brightness) | runtime settings | no | none | yes |
| **D** | Kiosk settings (stay-awake, rotation lock, timeout) | `settings put` | no | none | yes |
| **B** | Haptic strength | `/vendor/build.prop` | yes | low | **no** |
| **A** | Display config (density + HDR) | `/vendor/etc/displayconfig/` | yes | **bootloop if malformed** | **no** |

Recommended order **C -> D -> B -> A**, cheapest and safest first. C is free and two of its three
items are still untried, including the fingerprint workaround that likely disproves TURNOVER.md.

`patches/A-displayconfig/apply.ps1` **refuses to install** a file missing any of the five
mandatory `<hdrBrightnessConfig>` children, warns if `sdrHdrRatioMap` is absent (config would
load but do nothing), then reboots and verifies — printing TWRP recovery instructions if the
device fails to come back.

`patches/D-kiosk-settings/` backs prior values up to `backup.json` so `revert.ps1` restores
exactly what was there. It also prints an **AMOLED burn-in warning**: `stay_on_while_plugged_in`
keeps a static dashboard lit indefinitely, which is a real risk on this panel and not
automatically the right choice for a wall mount.

### Still unproven, and only the device can settle it

Whether the Tab S6's composer actually boosts highlights with the HDR config in place. The
emulator's virtual display advertises `mSupportedHdrTypes=[]` so it can never produce an HDR
layer; the tablet advertises `[2,3,4]`. Everything up to that final step is verified.

Emulator (`hdrtest` AVD) left installed for future testing; config cleared and instance shut down.

---

## FINGERPRINT + AUDIO — deeper research (2026-08-16, ~16:50)

### Fingerprint — TURNOVER.md is probably wrong, and the real mechanism is now known

**The Tab S6 has an IN-DISPLAY OPTICAL sensor.** That is the crux. Optical sensors illuminate the
finger *with the screen* and photograph the reflection, so if the GSI drives the wrong illumination
colour the sensor physically cannot read. phh exposes exactly this control.

**Procedure (order matters) — Patch C3:**
1. `Treble Settings -> Misc Features -> "Under-display fp color"` (bottom of the "Other" category).
   Options Green / Cyan / White.
2. Set **Green** first — several ROMs only permit *enrollment* while green.
3. **Delete all fingerprints and re-register.** Mandatory after any colour change.
4. Switch back to **White** (Samsung stock's colour) for daily use.
5. If still failing: `Samsung features -> Workarounds -> "Enable workaround for broken fingerprint sensor"`.
6. Last resort: `Misc -> "Treat virtual sensors as real"` + reboot.

Earlier notes in this doc mentioned only step 5. The colour setting is the actual mechanism and was
missing. Still irrelevant to the wall-panel use case, but the TURNOVER.md line
"Fingerprint will never work on the GSI" should be corrected in PROJECT.md — it is very likely wrong.

Source: <https://xdaforums.com/t/fix-gsi-in-screen-fingerprint-sensor-not-working.4531397/>

### Audio — CORRECTION to this document's earlier claim

Earlier in this file the Treble audio toggles were called "the primary method for fixing/improving
Tab S6 audio on GSIs". **That was overstated.** What they actually do:

- *alternate audio policy* — primarily fixes **Bluetooth voice calls**, plus the headphone jack on
  some devices
- *stereo audio mode* — paired with it for Bluetooth/audio issues

The SM-T860 is **Wi-Fi only** (no voice calls) and its **four speakers already work** (`phh-spkrot`
confirmed running, all four CS35L41 amps driven). So these toggles are **unlikely to improve speaker
quality**. Worth trying only if Bluetooth speakers misbehave.

**What is genuinely gone vs stock:** Dolby Atmos, Samsung's audio tuning, UHQ upscaling. All One UI
features — **not recoverable on a GSI**, same category as HDR.

**What CAN be recovered — new Patch E:** `RootlessJamesDSP` gives a full system-wide DSP chain
(parametric EQ, convolution, bass, virtual surround, compressor) with **no root and no Magisk**. It
bypasses Android's effects API by using internal audio capture.
- F-Droid: <https://f-droid.org/en/packages/me.timschneeberger.rootlessjamesdsp/>
- GitHub: <https://github.com/timschneeb/RootlessJamesDSP>

**Critical compatibility limit:** processes **SmartTube / YouTube / YouTube Music** (the main use
case here) but **NOT Brave or any Chrome-based app** — they block audio capture. If the kiosk ends
up playing audio through a WebView rather than SmartTube, Patch E will not affect it. Also cannot
coexist with Wavelet. Processing inside Brave would require a *rooted* DSP (Magisk module), and
Magisk is not installed.

### Patch set is now five

`C:\Users\Justin\S6Tab\patches\` — A (display config), B (haptics), C (Treble toggles),
D (kiosk settings), **E (audio DSP)**. Recommended order C -> D -> E -> B -> A.

---

## SPEAKER QUALITY — the real audio goal (2026-08-16, ~17:00)

Justin clarified: **the priority is the speakers themselves.** On One UI they were "amazing"; on
the GSI all four play but sound worse. This is a different problem from EQ, and it has a specific
and promising hypothesis.

### Hypothesis: the CS35L41 onboard DSP is not loaded/enabled

The Tab S6 has four **Cirrus Logic CS35L41** amps. Each contains an **onboard DSP** running
firmware that does:
- **speaker protection** (excursion/thermal limiting)
- **bass extension + loudness enhancement** — this is what makes small drivers sound big
- per-unit **calibration** measured at the factory

Samsung loads its calibration + AKG-derived tuning into that DSP on stock, then layers Dolby Atmos
on top.

**Neither speaker fix for this device touches any of it.** Verified by reading `phh-spkrot.sh`
directly off this tablet: it calls `tinymix` **solely** on `"<FL|FR|RL|RR> ASPRX1 Slot Position"`.
That is channel routing, nothing else. The original 1987tlz Magisk module
(<https://xdaforums.com/t/gsi-4-speaker-fix-for-galaxy-tab-s6.4780990/>) does the same — its own
thread describes it as fixing which speakers play and notes rotation was unsolved, which the newer
fixes zip then added. Neither claims any tuning or gain work.

So the plausible story: **routing is fixed, amps play, but the DSP that gives them body is not
running.** That would sound exactly like "all four work, but thin."

**Encouraging:** `/vendor` is still Samsung's partition, untouched by the GSI, so the Cirrus
firmware and calibration blobs are almost certainly still physically present. The open question is
purely whether anything loads and enables them.

### Patch F — read-only diagnostic written

`patches/F-speaker-tuning/diagnose.ps1` — **writes nothing.** Requires root (`tinymix` returns
"Failed to open mixer" as the plain shell user; this was already hit during verification).

It dumps: sound cards, Cirrus firmware files present in `/vendor`, **`dmesg` evidence of whether
the kernel actually loaded that firmware**, calibration data locations, the **full `tinymix`
control list**, DSP/protection/tuning controls, gain/volume controls, current per-amp slot
positions, audio HAL properties, and `/vendor/etc/audio*` policy files.

Run it and send back `speaker-report.txt`; the mixer dump determines whether a safe targeted
change exists.

### SAFETY — do not raise amp gain blind

Speaker protection firmware exists because these drivers can be **physically damaged** by
overdriving. If protection is not running and gain is raised anyway, distortion or permanent driver
damage is possible — and unlike a bad config file, **that is not recoverable via TWRP.**
Hence diagnose-first, tweak-only-after-analysis.

### Realistic outcomes

- **Dolby Atmos is not coming back** — One UI component, same category as HDR.
- **If the Cirrus DSP is genuinely not loaded, enabling it could be a large improvement.** This is
  the single most likely explanation for the quality drop and the most promising lead in the
  whole audio thread.
- **If the DSP is already loaded**, the remaining gap is Samsung's tuning/Atmos layer, and the
  practical answer becomes EQ compensation via Patch E — which covers SmartTube but not Brave.

---

# ============ OUTSTANDING AS OF 2026-08-16 17:10 ============

## Flash project: COMPLETE
Bootloader unlocked, TWRP flashed, LineageOS 23.2 GSI (Android 16) booted, fixes zip verified live
at service level, SmartTube + Brave installed, brightness and colour fixed. Nothing irreversible
remains. Device is working.

## Blocked — needs Justin at the tablet

| # | Item | What to do |
|---|---|---|
| 1 | **Speaker diagnostic (Patch F)** | Enable root, run `patches\F-speaker-tuning\diagnose.ps1`, send `speaker-report.txt`. **Top priority — this is the main audio goal.** |
| 2 | All four speakers | Listening test: play audio, cup each corner, rotate to check L/R follows |
| 3 | Auto-rotate | Verify |
| 4 | Sleep / wake | Verify |
| 5 | **SmartTube VP9 + 1080p60 cap** | **Not optional.** SD855 has no AV1 hardware decode — without this, newer videos software-decode and stutter |
| 6 | YouTube playback smoke test | Confirm smooth |
| 7 | Treble toggles (Patch C) | Audio toggles + fingerprint procedure — all untried |
| 8 | Kiosk settings (Patch D) | Run `apply.ps1` |
| 9 | Audio DSP (Patch E) | Install RootlessJamesDSP |
| 10 | Display config (Patch A) | Optional/experimental. Do last. Bootloop risk. |

## Known connection issue
Tablet drops off USB entirely when adbd restarts (`adb root`). Wireless debugging is the reliable
path — already paired as `adb-R52M80LB8CE-j54a1b`, just re-enable Wireless debugging and
`adb mdns services` for the current port. Pairing port != connect port; codes are 6 digits.

## Corrections to TURNOVER.md to fold into PROJECT.md
1. `C:\Users\rdp\Downloads\S6 Tab` mirror is not readable from Justin's account
2. Odin exe is `Odin3_v3.14.4_Samfw.com.exe`, not `Odin3 v3.14.4.exe`
3. "USB debugging enabled" was stale
4. **FRP / Reactivation Lock not mentioned at all** — Reactivation Lock would have blocked Odin
5. TWRP's "Swipe to Allow Modifications" prompt not mentioned — required
6. **"Fingerprint will never work on the GSI" is probably wrong** — see Patch C3
7. Turnover's own claim that the fixes zip handles speakers is true for *routing only*, not tuning

## Not started (later phases, not this session)
WebView kiosk APK, InkyPi integration.

## Patch set — now nine (`C:\Users\Justin\S6Tab\patches\`)

| # | Patch | Root? | Risk | Survives GSI update? |
|---|---|---|---|---|
| A | Display config (density + HDR) | yes | **bootloop if malformed** | no |
| B | Haptic strength | yes | low | no |
| C | Treble toggles (audio, fingerprint, brightness) | no | none | yes |
| D | Kiosk settings | no | none | yes |
| E | Audio DSP (RootlessJamesDSP) | no | none | yes |
| F | **Speaker tuning — diagnostic only** | yes | none (reads) | n/a |
| G | **Battery longevity — diagnostic only** | yes | none (reads) | n/a |
| H | Persistent wireless adb | yes | LAN security trade | yes |
| I | OLED burn-in protection | no | none | yes |

### Three added 17:15 — all aimed at the tablet surviving as a wall panel

**G — Battery longevity (highest long-term value).** Plugged in 24/7 holds the cell at 100% and
warm, which is the fastest way to wear it out. On a Tab S6 that means a **swollen battery in a year
or two**, pushing the screen out of the chassis. Fix is capping charge near 80% via a power_supply
sysfs node — but which node exists varies (`batt_slate_mode` / `store_mode` / `input_suspend` /
`batt_capacity_max`). **Diagnostic written; do not guess the node**, writing the wrong one can halt
charging entirely or freeze the reported level.

**H — Persistent wireless adb.** `persist.adb.tcp.port=5555` survives reboot, so the tablet stays
manageable once wall-mounted, and it sidesteps this device's habit of vanishing from USB whenever
adbd restarts. **Trade: leaves an adb port open on the LAN permanently.** Reasonable on a home
network, but a deliberate choice.

**I — OLED burn-in protection.** Flagged as **the most likely way to ruin this tablet long-term**.
A static dashboard on AMOLED permanently ghosts. Dark theme, lower brightness and not running the
screen 24/7 all help; the real fix belongs to the phase-2 kiosk app (shift layout periodically,
avoid fixed bright elements).

**Note the conflict:** Patch D sets `stay_on_while_plugged_in`, Patch I argues against it. Both
READMEs cross-reference each other. This is a genuine design decision for the wall panel, not a bug
— an always-on display is more useful and wears the panel faster.

### Both new diagnostics are read-only
F (speakers) and G (battery) write nothing. Run them, send the reports back, then decide.

## Backlog — further patch ideas, not yet built (brainstormed 17:20)

Ordered by value for a kitchen wall panel. Most are settings-only and low risk.

**Kiosk hardening**
- **J — Screen pinning / lock task mode.** Stops anyone navigating out of the dashboard. Android's
  built-in app pinning, or a launcher replacement. Important if the panel is reachable by guests/kids.
- **K — Disable lock screen.** Wake straight to the dashboard, no swipe. `Settings -> Security -> None`.
- **L — Auto-start kiosk on boot.** BOOT_COMPLETED receiver in the kiosk APK, or set it as HOME
  launcher so it is unavoidable. Belongs with the phase-2 app.
- **M — Auto-restart on crash.** Watchdog so a WebView crash does not leave a blank wall panel.

**Reliability**
- **N — Wi-Fi never sleeps.** A panel that drops off Wi-Fi when idle is useless.
  `settings put global wifi_sleep_policy 2`.
- **O — Screen on/off schedule.** Off overnight. Saves the panel (burn-in) and power. Needs a
  scheduler — Tasker, or a cron-ish init script, or handled by the kiosk app.
- **P — Thermal watch.** SD855 in a sealed wall mount with no airflow. Worth logging
  `/sys/class/thermal/thermal_zone*/temp` before trusting it long-term.
- **Q — Disable OTA / update nags.** Nothing should pop a dialog over the dashboard.

**Polish**
- **R — Disable animations.** Snappier, slightly less power.
  `window_animation_scale` / `transition_animation_scale` / `animator_duration_scale` = 0.
- **S — Volume lock.** Stop accidental volume changes on a touch panel.
- **T — Trim background apps.** GAPPS is absent already so it is lean, but unused system packages
  can be disabled with `pm disable-user`.

None of these are blocked on anything; they are just not written yet.

---

# INKY OLED — DASHBOARD APP, BUILT AND DOGFOODED (2026-08-16 17:30–18:00)

**Renamed from "Wall Panel" to `Inky OLED`** at Justin's request — an OLED variant of the InkyPi
idea. Package `com.justin.inkyoled`, directory **`C:\Users\Justin\S6Tab\inky-oled\`**,
artifact **`inkyoled.apk` (16.7 KB)**. Built, signed, and dogfooded on an emulator configured to
the Tab S6's exact panel: **2560x1600 @ density 300** (AVD `tabs6`).

## Scope decision

Justin clarified: InkyPi **is** running on a Pi, but he wants **a bundled standalone Android app**
that runs everything on the tablet itself — no Pi dependency.

Relevant finding: **InkyPi cannot simply be pointed at.** It requires a Raspberry Pi plus physical
e-ink hardware, and its web interface is a **configuration UI**, not a dashboard view — it renders
images out to the e-ink panel. There is no documented HTTP endpoint serving the rendered output.
So mirroring it was not viable; a tablet-native dashboard was the right call.

Built: same *idea* as InkyPi (plugin cards, scheduled refresh) rendered for a colour LCD.

## What it is

- Single fullscreen `Activity` hosting a `WebView`; dashboard is bundled HTML/CSS/JS in `assets/`
- **No server, no Pi, no network dependency** except the weather fetch
- Weather via **Open-Meteo — no API key**
- Cards: clock/date, current weather, 4-day forecast
- Immersive (no status/nav bar), back button disabled, `FLAG_KEEP_SCREEN_ON`
- **Burn-in drift**: whole layout shifts a few px every 2 min. Black background, thin type, low
  pixel coverage — deliberate AMOLED choices, ties directly to patch I.

## Build

`build.ps1` — uses **only Android SDK build-tools**: aapt2 -> javac -> d8 -> zipalign -> apksigner.
**No Gradle, no Maven, no network.** Seconds to build. JDK 17 + build-tools 36.0.0 + android-36.

## Two build bugs worth recording

1. **PowerShell string concatenation.** `$srcs + $gen` concatenated two single-element results into
   one string, producing `javac error: Invalid filename: <path><path>`. Fixed with `@($srcs) + @($gen)`.
2. **aapt2 on Windows writes asset subdirectory separators as BACKSLASHES.** The APK contained
   `assets/dashboard\index.html`, so `file:///android_asset/dashboard/index.html` never resolved and
   the app rendered a black screen. **Fix: keep assets FLAT at the assets root.** This cost a debug
   cycle and would bite anyone rebuilding this on Windows.

## Verified in emulator

Installed, launched, foreground confirmed, screenshot captured: clock renders ("5:30 PM,
Sunday, August 16"), layout correct, and the weather card correctly shows its "No location set"
state because lat/lon are intentionally unset. No crashes (only benign chromium cache warnings).

## DOGFOODING PASS — tested at real tablet resolution, two real bugs found

Created AVD `tabs6` at **2560x1600 density 300** (matching the Tab S6 with patch A's density
applied) rather than the default tiny emulator. Testing at true resolution immediately exposed two
problems that were invisible at 640x320:

1. **~40% of the panel was dead space.** `grid-template-rows: auto 1fr` stretched the forecast card
   to fill its column, leaving the forecast marooned in a huge empty box and the bottom third of
   the screen blank. Fixed: `auto auto` + `align-content: center`, so cards size to content and the
   block centres.
2. **Everything was far too small for a wall panel.** Sizes had been tuned against the small
   emulator. Scaled up for 2-4 m viewing: clock 21vh -> 27vh, weather temp 8.4 -> 11vh, icon
   9 -> 12vh, forecast and labels to match.

**Weather verified working end to end** against the live Open-Meteo API — real values rendered
(71 deg, "Mostly clear", feels 72, 62% humidity, 4-day forecast with highs/lows). No API key needed.

Screenshot after fixes: `inky-oled/preview.png`.

## OUTSTANDING for the app

1. **Change the location in `assets/config.js`** — it currently ships with a **Seattle placeholder**
   so it works out of the box. Left deliberately rather than blank, but it must be changed or the
   panel shows Seattle's weather. Set both lat/lon to `null` to get a "set your location" notice.
2. Install on the tablet: `adb install -r C:\Users\Justin\S6Tab\inky-oled\inkyoled.apk`
3. Not built yet: auto-start on boot, on-device settings UI, screen pinning — backlog items J-M.

### Sources
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/xsd/display-device-config/display-device-config.xsd
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/display/DisplayDeviceConfig.java
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/display/config/HdrBrightnessData.java
- https://github.com/MisterZtr/LineageOS_gsi/releases
- https://xdaforums.com/t/rom-unofficial-android-15-sm-t860-one-ui-7-port-for-galaxy-tab-s6-wi-fi.4796861/
- https://xdaforums.com/t/port-sm-t860-one-ui-6-android-14-for-galaxy-tab-s6-wi-fi-all-hardware-working-except-fingerprint-quad-speaker-fix-included.4792324/
- https://xdaforums.com/t/fix-gsi-sm-t860-t865-galaxy-tab-s6-storage-all-4-speakers-rotation-aware-and-haptics-on-android-16-gsis.4796316/
- https://xdaforums.com/t/aosp-rom-official-android-14-gsi-install-instructions-for-galaxy-tab-s6-sm-t860-sm-t865.4573383/
- https://xdaforums.com/t/fix-gsi-in-screen-fingerprint-sensor-not-working.4531397/
- https://xdaforums.com/t/lineageos-24-is-on-its-way.4793065/
- https://www.androidauthority.com/lineageos-summertime-update-2026-3685112/

Asked Justin to enable Developer options -> USB debugging, accept the RSA prompt, and tick
"Always allow from this computer". Note adb is NOT required for the Odin steps (download mode does
not use adb), but it is required for `adb push` in TWRP (step 3) and for `adb install` (step 5).

---

## 2026-08-16 (evening) — ROOT achieved + speaker mystery SOLVED

### Root: permanent, via Magisk (patch: replaces the fragile `adb root`)

The recurring "USB drops after `adb root`" failure is now retired for good. `adb root` restarts
adbd, and this device's USB gadget HAL loses the re-enumeration race every time — proven three
times this session (USB wedges until reboot; the TLS wireless server also refuses to restart).

Fix — proper Magisk root instead of adbd root:
1. Extracted stock `boot.img.lz4` from the AP tar inside
   `01-stock-firmware-restore/SAMFW.COM_SM-T860_XAR_T860XXU5DXJ1_fac.zip`.
2. Magisk could not unpack the Samsung `.lz4` directly — decompressed it PC-side with the official
   lz4 v1.10.0 win64 binary to a raw 64 MB `boot.img` (verified `ANDROID!` magic).
3. Installed Magisk v30.7 APK, patched the raw boot.img on-device.
4. Pulled `magisk_patched-30700_aKpWs.img`, rebooted to TWRP (adb there is already root),
   `dd`-flashed it to `/dev/block/sda20` (boot), readback md5 matched exactly.
5. Rebooted. `su -c id` -> `uid=0(root) context=u:r:magisk:s0`. Grant tapped on device.

Stock boot.img and the Magisk-patched image are both archived in `03-twrp-vbmeta/` on the NAS.
Magisk-v30.7.apk archived in `05-apks/`.

### Three persistent wins locked in (all survive reboot)

- **Wireless adb pinned to port 5555** — `setprop persist.adb.tls_server.port 5555` +
  `settings put global adb_wifi_enabled 1`. No more mDNS roulette / screen-reading the port.
- **Battery cap 80%** (patch G) — `echo 80 > /sys/class/power_supply/battery/batt_full_capacity`,
  made persistent via Magisk boot script `/data/adb/service.d/battery-cap.sh`. Battery health is
  100% (charge_full == charge_full_design), so this is preventive for 24/7 mounted use.
- Verified after reboot: port=5555, adb_wifi=1, cap=80, boot script present.

### Speaker finding — patch-F hypothesis DISPROVEN

Full `tinymix` dump (4242 controls) with root. All four CS35L41 amps (RR/RL/FR/FL) report:
- `DSP Booted = On`, `DSP1 Preload Switch = On`
- `DSP1 Firmware = Protection` (the Cirrus protection/tuning firmware IS loaded)
- `HALO_STATE = 0x02` (running), `HALO_HEARTBEAT` incrementing (DSP alive)
- `CSPL_ENABLE = 1`, `CAL_STATUS = 1`, `CAL_R = 0x2184`, `CAL_CHECKSUM = 0x2185` matches,
  `CAL_SET_STATUS = 2` — calibration loaded AND applied, per speaker.

Conclusion: the speaker-protection + hardware tuning DSP is fully operational. The earlier
hypothesis ("routed but not tuned", patch F) is WRONG. Raising amp gain would have been both
unnecessary and risky — correctly avoided.

What is actually missing vs. stock One UI is Samsung's **software** effects layer (Dolby Atmos /
SoundAlive / UHQ) — a proprietary APK+DSP stack the GSI cannot carry. That is a software-EQ
problem, addressable by **patch E (JamesDSP)** — and with real root now available, the full rootful
JamesDSP works (convolver / impulse-response tuning + dynamic bass), not just the rootless variant.

Note: all four amps show `Boost Enable = Disabled`. Stock may have run the CS35L41 boost converter
enabled for more loudness/bass headroom. NOT changing it blind — revisit only if JamesDSP alone
doesn't close the gap, and only with the protection firmware confirmed still engaged.

### Full mixer dump saved
Local: scratchpad `tinymix-full.txt` (4242 lines). Kernel log confirms firmware probe:
`cs35l41 3-0040..0043 ... Revision A0`, `Prince MFD core probe`, `Prince Calibration Driver probe`.

### Outstanding (now unblocked by root)
- Install JamesDSP (rootful) and dial in EQ/bass — the real fix for "before it was amazing".
- Consider CS35L41 boost-enable experiment (cautious, protection must stay on).
- Still pending from before: SmartTube VP9/1080p cap (patch J1), Treble fingerprint procedure
  (patch C3), install Inky OLED + change the Seattle placeholder location.

---

## 2026-08-16 (late) — three device defects fixed (patches L and M)

### "No service" on the lock screen — FIXED

SM-T860 is Wi-Fi-only with no modem, but the lock screen showed a permanent "No service".
`ro.radio.noril=yes` was ALREADY set and is not sufficient — it stops the RIL loading but does not
stop the telephony *feature* being declared, and the feature is what drives the UI.

Three files declared it:
- /system/etc/permissions/android.hardware.telephony.gsm.xml
- /system/etc/permissions/android.hardware.telephony.ims.xml
- /vendor/etc/permissions/android.hardware.telephony.ims.xml

Note: /vendor/etc/permissions/handheld_core_hardware.xml LOOKS guilty when grepped for "telephony"
but every match is inside a comment. Read files before editing them.

Fix: Magisk module `no_telephony_t860` overlays those three paths with an empty <permissions/>
document. `/system` and `/vendor` untouched on disk. Verified: `pm list features | grep -c telephony`
went 8 -> 0, and the lock screen is clean.

### Battery percentage would not display — FIXED

`settings put system status_bar_show_battery_percent 1` was accepted, read back as 1, and did
nothing. Same for `status_bar_battery_style`. Restarting SystemUI did not help.

Root cause: **LineageOS keeps its own settings in a separate provider**,
`content://lineagesettings/system`. The identically-named key in AOSP's namespace is a decoy.

Fix:
```
content insert --uri content://lineagesettings/system \
  --bind name:s:status_bar_battery_style --bind value:s:2
```
Applies live. Measured style values on this build: 0 = icon, no number (even with the AOSP percent
setting on); 1 = circle, shows charging bolt not a number; **2 = text, "100%"**. There is no
icon-plus-number combination on this build — the AOSP percent setting does not compose with the
Lineage style.

Generalisable lesson: on LineageOS, when a `settings put` is silently ignored, query the
lineagesettings provider before concluding the feature does not exist.

### SD card endlessly asking to be formatted — FIXED

The card was fine the whole time. vold determines filesystem support by looking for the name in
/proc/filesystems. Samsung's kernel implements exFAT in a driver registered as **`sdfat`**, so
vold's check for the literal string "exfat" fails:

```
vold: /dev/block/vold/public:179,1: TYPE="exfat"
vold: public:179,1 unsupported filesystem exfat
```

Proved the kernel was capable all along — `mount -t sdfat -o ro` succeeded while vold was calling
the same card unsupported.

**Why reformatting never helped:** Android formats large cards as exFAT by default, so every
reformat landed back on the one filesystem vold refuses. The format prompt was offering to recreate
the bug.

Fix: reformatted as **ext4** (512 GB card; ext4 chosen over FAT32 because FAT32 caps files at 4 GB,
which is unusable for films). Card verified: mounted by vold, 468 GB free, write test passed,
Android created its standard media folders. Trade-off recorded: ext4 is not readable by Windows
without extra software — load over network/MTP/adb.

The format script refuses to run unless the card is empty (mounts read-only and counts entries
first). Card was verified empty — 768 KB used of 477 GB — before formatting.

### Also done
- Battery percentage + telephony fix committed as patch L; SD card as patch M.
- RootlessJamesDSP v1.6.14 installed from F-Droid (`me.timschneeberger.rootlessjamesdsp`), with
  DUMP / READ_LOGS / PROJECT_MEDIA pre-granted. Still needs on-device onboarding.

### Display state measured (for future work)
- `wm density` = 360 on a 286 dpi panel -> UI oversized. `wm density 300` is the SAFE fix (lives in
  /data, instantly revertable) — patch A's vendor XML is NOT needed for density and carries
  bootloop risk. Not yet applied, awaiting Justin's call.
- **Auto-brightness is genuinely non-functional**, not merely off. The ambient light sensor exists
  and works (`veml3328`), but the framework reports `mAutoBrightnessAvailable=false`. Confirmed
  inert: with `screen_brightness_mode=1`, `mUseAutoBrightness=true` yet `mBrightnessReason=manual`
  and `mAmbientLux=-1.0`. The GSI's `config_automatic_brightness_available` resource is false.
  Fixing needs a runtime resource overlay (RRO). Worth doing for a wall panel.
- HDR remains inert as documented: `mHdrBrightnessData=null`, `mMaxDesiredHdrRatio=1.0`, though the
  panel advertises HDR10/HLG/HDR10+ at 564.3 nits peak.
- `/vendor/etc/displayconfig/` does not exist — patch A has never been applied.

---

## 2026-08-16 (late, cont.) — adaptive brightness RRO + density claim corrected

### Battery cap: confirmed working across reboot
`batt_full_capacity = 80`, status "Not charging" at level 100. The Magisk boot script
(`/data/adb/service.d/battery-cap.sh`) re-applied it automatically after reboot. Nothing further
needed — it is already enabled. Level still reads 100 because the cell was full when the cap was
set; it will drain, then recharge to 80 and stop.

Boot script extended: wireless adb `adb_wifi_enabled` resets to 0 on EVERY boot even though the
port is pinned by a persist prop, so the script now re-arms it alongside the charge cap.

### Density: 360 is CORRECT — earlier plan was wrong

Checked Samsung's own untouched `/vendor/build.prop`:
```
ro.sf.lcd_density=360
```
So 360 dpi **is** the Samsung stock value, and the GSI matches it exactly. The repo previously
listed "UI rendered at 360 dpi on a ~287 dpi panel" as a defect fixable by patch A. That was
wrong and has been corrected in both READMEs.

Dropping to 300 is a legitimate *preference* (smaller text, more content) but it moves AWAY from
stock. It also never needed patch A's bootloop-capable vendor XML — `wm density 300` does the same
job from /data, survives reboots, and reverts with `wm density reset`.

Lesson: check the vendor partition before calling something a GSI defect.

### Adaptive brightness — RRO built and working, sensor is the blocker

Built patch N: a **runtime resource overlay** targeting the `android` package that flips
`config_automatic_brightness_available` to true. The GSI hardcodes it false because a generic image
cannot assume a light sensor exists.

Built with SDK build-tools only (aapt2 -> zipalign -> apksigner), 8.5 KB, installed into
`/product/overlay` via a Magisk module — framework overlays must be "preinstalled", they cannot be
sideloaded with `pm install`.

**The overlay demonstrably works:**
```
cmd overlay list android   -> [x] com.tabs6.autobrightness.overlay
mAutoBrightnessAvailable   -> false -> TRUE
mBrightnessReason          -> manual -> AUTOMATIC
sensor subscription        -> active-count=2, sampling_period=200ms
```

**But the ambient light sensor produces no data:**
```
mAmbientLux = -1.0
mScreenAutoBrightness = 0.027559055        (i.e. ~2.7%, the floor)
dumpsys sensorservice: veml3328 ... last 50 events
     1 (ts=68.359581812) 0.00, 0.00, 0.00   <- exactly ONE event, all zeros
/sys/class/sensors/light_sensor/lux      -> 0,0,0,0,2,0
/sys/class/sensors/light_sensor/raw_data -> 0,0,0,0,2,0
/sys/class/sensors/light_sensor/name     -> VEML3328  (vendor CAPELLA)
```
Samsung's sensor stack is alive (`vendor.sensors-hal-2-0-multihal`, `sscrpcd`, `factory.ssc`).

`android.sensor.light` is an **on-change** sensor — it only emits when the value changes. A single
zero sample at boot then silence is equally consistent with (a) a driver that is not working under
the GSI, and (b) a tablet physically sitting somewhere dark. **That cannot be distinguished over
adb.**

**Adaptive brightness deliberately left OFF** and manual brightness restored (screen_brightness=100),
because enabling it with a dead sensor pins the display at ~2.7% — much worse than manual.

**OUTSTANDING — needs Justin, 15 seconds:** with the tablet awake and face-up, run
```
adb shell "su -c 'for i in 1 2 3 4 5 6 7 8 9 10; do cat /sys/class/sensors/light_sensor/lux; sleep 1; done'"
```
and shine a phone torch at the top edge near the front camera, then cover it.
- numbers move -> sensor fine, it was just dark: `settings put system screen_brightness_mode 1`
- stays 0,0,0,0,2,0 -> ALS non-functional on this GSI; remove the module, no overlay can fix it

Either way the overlay is kept as a working template for changing any framework `config_*` value
on this GSI — that capability did not exist before today.
