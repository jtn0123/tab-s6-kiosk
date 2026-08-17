# Tab S6 — patch set

**Independent** patches for the SM-T860 running LineageOS 23.2 GSI (Android 16). Each uses a
different mechanism, so each can be applied, skipped, or reverted on its own.

The tablet is used **both as a mounted dashboard and as a handheld video player**. Those modes want
opposite settings, so nothing here assumes one or the other — patch D takes a `-Mode` switch, and
the rest are genuine defect fixes that apply either way.

Everything here was researched and — where possible — **validated in an Android 16 emulator
(`android-36-ext19`) before ever touching the tablet.** Findings are recorded in
`../hdr-research/` and in the project PROGRESS.md on the NAS.

## Apply in this order (cheapest and safest first)

| # | Patch | Mechanism | Root? | Risk | Survives GSI update? |
|---|---|---|---|---|---|
| **C** | Treble toggles | runtime settings | no | none | yes |
| **D** | Kiosk settings | `settings put` | no | none | yes |
| **E** | Audio DSP (JamesDSP) | app + adb permission | optional | none | yes |
| **K** | **Magisk root** | patched boot image | n/a | Play Integrity fails | **no** |
| **G** | Battery longevity — **applied** | `batt_full_capacity` sysfs | yes | none | yes (`/data`) |
| **H** | Persistent wireless adb | `persist.adb.tls_server.port` | yes | LAN security trade | yes |
| **I** | OLED burn-in protection | settings + kiosk design | no | none | yes |
| **B** | Haptic strength | `/vendor/build.prop` | yes | low | **no** |
| **A** | Display config | `/vendor/etc/displayconfig/` | yes | **bootloop if malformed** | **no** |
| **L** | Wi-Fi-only cleanup + battery % — **applied** | Magisk module + lineagesettings | yes | none | partly (`/data`) |
| **M** | SD card mounts at last — **applied** | reformat ext4 | yes | **erases the card** | yes |
| **F** | Speaker tuning — **closed, no action** | `tinymix` read-only | yes | none (reads only) | n/a |

**Start with C.** It is free, instant, and two of its three items are still untried —
including one that likely disproves a claim in the original turnover doc.

**Do K before anything needing root.** `adb root` does not work on this device — it kills USB *and*
wireless until a reboot. Patch K is how you get a working `su`.

**Do A last**, and only if you actually want HDR. It is the only patch that can brick a boot.

---

## C — Treble Settings toggles
`C-treble-toggles/README.md`

Audio policy + stereo, fingerprint workaround, and the brightness-range fix (already applied,
and it worked — the display went from "pegged at 255 and still dim" to comfortable at 84/255).

Treble Settings has **no launcher icon**; launch with
`adb shell am start -n me.phh.treble.app/.TopLevelSettingsActivity`

## D — Kiosk / wall-panel settings
`D-kiosk-settings/apply.ps1` · `revert.ps1`

Stay-awake while charging, long timeout, locked landscape, no screensaver.
Backs up prior values to `backup.json` so `revert.ps1` restores exactly.

Read the burn-in warning it prints — a static dashboard on an AMOLED left permanently on is a
real risk, and "stay on forever" is not automatically the right answer for a wall panel.

## I — OLED burn-in protection
`I-burnin/README.md`

**The most likely way to ruin this tablet long-term.** A static dashboard on AMOLED permanently
ghosts into the panel. Dark theme + lower brightness + not leaving it lit 24/7 all help, but the
real fix is the kiosk app keeping pixels moving.

Directly conflicts with Patch D's `stay_on_while_plugged_in`. Read both before choosing.

## L — Wi-Fi-only cleanup + battery percentage — **APPLIED**
`L-wifi-only-ui/README.md` · `no_telephony_t860/`

Two things a GSI gets wrong on a Wi-Fi-only tablet:

**"No service" on the lock screen, permanently.** The T860 has no modem, but the GSI declares
telephony hardware anyway, so Android asks for service state and renders the answer forever.
`ro.radio.noril=yes` does *not* fix it — that was already set. A Magisk module empties the three
permission XMLs that declare the feature. Verified: 8 telephony features before, 0 after.

**Battery percentage that refuses to appear.** `settings put system status_bar_show_battery_percent
1` is accepted, reads back as `1`, and does nothing — because LineageOS keeps this in its **own
settings provider**, `content://lineagesettings/system`. Worth remembering generally: when a
`settings put` is silently ignored on LineageOS, look there before assuming the feature is absent.

## M — SD card that will not stop asking to be formatted — **APPLIED**
`M-sdcard/README.md` · `format-sdcard.sh`

Reformatting never fixes this, and there is a reason. vold looks for `exfat` in `/proc/filesystems`;
Samsung's kernel registers the same driver as **`sdfat`**. So the kernel mounts the card fine while
vold calls it unsupported — and since Android formats large cards as exFAT by default, every format
recreates the bug.

Fixed by reformatting as **ext4** (no 4 GB file limit, unlike FAT32). The script refuses to run
unless the card is empty. **It erases the card** — back up first.

## K — Magisk root (prerequisite for A, B, G, H, L, M)
`K-magisk-root/README.md`

**`adb root` is unusable on this device.** It restarts adbd, the vendor USB gadget HAL loses the
re-enumeration race, and the tablet vanishes from USB *and* wireless until a reboot. Reproduced
three times.

Magisk patches the boot image instead, so `su` works inside a normal shell and adbd never restarts.
Includes the gotcha that costs an hour: **Magisk cannot unpack Samsung's `boot.img.lz4`** — you must
decompress it PC-side first.

## H — Persistent wireless adb
`H-wireless-adb/README.md`

Pins wireless debugging to a fixed port so it stops picking a random one each boot. Needed here
because this GSI's Settings screen sometimes fails to display the port at all.

Uses `persist.adb.tls_server.port` (modern, TLS-paired) rather than the legacy unencrypted
`persist.adb.tcp.port`. Trade: a paired adb service stays reachable on the LAN.

Also documents how to recover the port **without root** — adbd logs it, and `shell` is in the `log`
group. `adb mdns services` is unreliable and fails silently.

## G — Battery longevity (highest long-term value) — **APPLIED**
`G-battery/README.md` · `battery-cap.sh` · `diagnose.ps1`

A wall panel is plugged in 24/7. Holding a lithium cell at 100% and warm wears it out fast — on a
Tab S6 that means a **swollen battery in a year or two**, which pushes the screen out of the
chassis.

The node on this device is **`batt_full_capacity`** — Samsung's real charge limit, enforced in
firmware, so no polling daemon is needed. Set to `80`, made persistent with a Magisk boot script.
(`batt_capacity_max` is *not* a charge limit — do not touch it.)

Battery health was measured at **100%** (`charge_full == charge_full_design`), so this is purely
preventive.

## F — Speaker tuning investigation — **CLOSED, hypothesis disproven**
`F-speaker-tuning/README.md` · `diagnose.ps1`

The theory was that the CS35L41 amps' onboard DSP never loads on a GSI, leaving the speakers
"routed but not tuned". **The diagnostic disproved it.**

All four amps report `DSP Booted = On`, `DSP1 Firmware = Protection`, `HALO_STATE = 2` with a live
heartbeat, `CSPL_ENABLE = 1`, and a valid applied calibration (`CAL_STATUS = 1`,
`CAL_SET_STATUS = 2`, checksum matches). The hardware tuning and protection DSP is **fully
operational**.

What is missing is Samsung's **software** effects layer (Dolby Atmos / SoundAlive) — not a mixer
setting. That makes patch E the answer, not a `tinymix` tweak.

⚠️ This is why diagnose-first mattered. Raising amp gain "because the DSP isn't loaded" would have
been driving drivers whose protection *was* running — risking permanent damage, unrecoverable by
TWRP — to fix a problem that did not exist.

## E — System-wide audio DSP (the actual fix for speaker quality)
`E-audio-dsp/README.md`

JamesDSP — parametric EQ, convolution, bass, virtual surround, system-wide.

With patch F closed, **this is the real answer to "before it was amazing"**. Samsung's Dolby Atmos /
UHQ tuning are One UI components, not recoverable on a GSI, same as HDR. The Treble audio toggles in
Patch C are mostly Bluetooth-call and headphone-jack fixes and will likely do nothing here.

**Now that root is available (patch K), prefer the rootful JamesDSP** — it hooks at the audio HAL,
so it processes *everything* including Brave/WebView. The rootless variant is limited to apps that
permit audio capture: SmartTube/YouTube yes, **Brave and Chrome-based apps no**.

## B — Haptic strength
`B-haptics/README.md`

Tuning only. Haptics are already confirmed working (verified via the vibration history showing
real amplitude ramps from SystemUI touches). Skip unless the default feel is wrong.

## A — Display config: density + HDR
`A-displayconfig/display_port_129.xml` · `apply.ps1`

Two independently removable **sections** in one file — Android loads exactly one display config
per display, so these cannot be separate files.

- **Density**: 360 -> 300. The panel is ~287 dpi natively; 360 renders larger than 1:1.
  Emulator-verified working (160 -> 200).
- **HDR**: supplies the `sdrHdrRatioMap` the framework currently lacks. Emulator-verified that
  `mHdrBrightnessData` goes null -> populated with `highestHdrSdrRatio 4.0`.
  **Unproven**: whether this tablet's composer actually boosts highlights.

`apply.ps1` refuses to install a file missing any of the five mandatory
`<hdrBrightnessConfig>` children, since that bootloops system_server — a failure mode
reproduced deliberately in the emulator, complete with stack trace.

**If it bootloops: boot TWRP (Vol Up + Power) and delete
`/vendor/etc/displayconfig/display_port_129.xml`.** Do not count on adb; adb authorization
needs system_server, which is the process crashing.

---

## After every GSI update

Patches A and B live in `/vendor` and are wiped by a system image update. Re-apply them, along
with `tabs6-gsi-fixes.zip`. Patches C and D live in `/data` and survive.

**Patch K (root) does not survive a system image flash either** — the GSI update replaces `system`,
but re-flashing `boot` from stock (or an OTA touching boot) removes Magisk. Keep both the stock and
patched boot images archived so root is a two-minute `dd`, not a re-derivation. Patch G's boot
script lives in `/data/adb/` and survives, but stops taking effect until root is restored.
