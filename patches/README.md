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
| **E** | Audio DSP (RootlessJamesDSP) | app + adb permission | no | none | yes |
| **F** | Speaker tuning — **diagnostic only** | `tinymix` read-only | yes | none (reads only) | n/a |
| **G** | Battery longevity — **diagnostic first** | power_supply sysfs | yes | none (reads only) | n/a |
| **H** | Persistent wireless adb | `persist.adb.tcp.port` | yes | LAN security trade | yes |
| **I** | OLED burn-in protection | settings + kiosk design | no | none | yes |
| **B** | Haptic strength | `/vendor/build.prop` | yes | low | **no** |
| **A** | Display config | `/vendor/etc/displayconfig/` | yes | **bootloop if malformed** | **no** |

**Start with C.** It is free, instant, and two of its three items are still untried —
including one that likely disproves a claim in the original turnover doc.

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

## H — Persistent wireless adb
`H-wireless-adb/README.md`

Survives reboots, so you can manage the tablet once it is on the wall. Also sidesteps the USB
drop-out this device does whenever adbd restarts.

Trade: leaves an adb port open on the LAN permanently. Fine on a home network, but a deliberate
choice rather than a default.

## G — Battery longevity (highest long-term value)
`G-battery/diagnose.ps1` · `README.md`

A wall panel is plugged in 24/7. Holding a lithium cell at 100% and warm wears it out fast — on a
Tab S6 that means a **swollen battery in a year or two**, which pushes the screen out of the
chassis. Capping charge around 80% is the fix.

Run the diagnostic first; it finds which charge-control sysfs node this device actually has
(`batt_slate_mode` / `store_mode` / `input_suspend`). **Do not guess** — writing the wrong one can
stop charging entirely or freeze the reported level.

Interacts with Patch D: if the screen stays on permanently, the extra heat makes charge capping
matter more, not less.

## F — Speaker tuning investigation (START HERE for speaker quality)
`F-speaker-tuning/diagnose.ps1` · `README.md`

**This targets the actual complaint: all four speakers play, but One UI sounded far better.**

The four CS35L41 amps have onboard DSP doing speaker protection, bass extension and loudness —
that DSP is what makes small drivers sound big. **Neither speaker fix touches it.** Both only set
ASPRX1 slot positions, i.e. routing. Verified by reading `phh-spkrot.sh` off the tablet.

`/vendor` is still Samsung's, so the Cirrus firmware and calibration blobs are almost certainly
still on the device. The diagnostic finds out whether anything loads them.

**Read-only. Writes nothing.** Run it, send back `speaker-report.txt`, then decide.

⚠️ **Do not raise amp gain blind.** Speaker protection exists to stop these drivers being
physically damaged. Overdriving without protection running risks permanent damage — and unlike a
bad config file, that is not recoverable with TWRP.

## E — System-wide audio DSP
`E-audio-dsp/README.md`

RootlessJamesDSP — parametric EQ, convolution, bass, virtual surround, system-wide, **no root**.

This is the real answer to "better audio". Samsung's Dolby Atmos / UHQ / tuning are One UI
features and are not recoverable on a GSI, same as HDR. The Treble audio toggles in Patch C are
mostly Bluetooth-call and headphone-jack fixes and will likely do nothing here.

**Compatibility limit worth knowing up front:** it processes **SmartTube / YouTube** (your main
use case) but **NOT Brave or any Chrome-based app**, which block audio capture. If the kiosk ends
up playing audio through a WebView instead of SmartTube, this patch will not affect it.

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
