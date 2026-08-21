# Patch L — Wi-Fi-only cleanup and status bar

**Status: APPLIED and verified.** Two fixes that make a GSI stop pretending this is a phone.

## L1 — "No service" on the lock screen

### The problem

The SM-T860 is the **Wi-Fi-only** Tab S6. It has no modem. But the lock screen shows a permanent
**"No service"** in the top-left, and Settings offers SIM and calling options that can never work.

### Why it happens

The GSI ships the standard telephony feature declarations, and Samsung's `/vendor` contributes one
too. Android therefore believes a modem exists, asks for service state, gets `OUT_OF_SERVICE`, and
dutifully renders "No service" forever:

```
mServiceState={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE), ...}
```

Setting `ro.radio.noril=yes` is **not enough** — it was already set on this device. That stops the
RIL from loading; it does not stop the *feature* being declared, and the feature is what drives the
UI.

Three files declare it:

```
/system/etc/permissions/android.hardware.telephony.gsm.xml
/system/etc/permissions/android.hardware.telephony.ims.xml
/vendor/etc/permissions/android.hardware.telephony.ims.xml
```

`/vendor/etc/permissions/handheld_core_hardware.xml` **looks** like a culprit if you grep for
"telephony", but every match there is inside a comment. Read the file before editing it.

### The fix

A Magisk module that overlays those three paths with an empty `<permissions>` document, so the
features are never declared. `/system` and `/vendor` are untouched on disk.

```bash
adb push no_telephony_t860 /data/local/tmp/no_telephony_t860
adb shell "su -c 'cp -r /data/local/tmp/no_telephony_t860 /data/adb/modules/ && \
  chown -R root:root /data/adb/modules/no_telephony_t860 && \
  chmod -R 755 /data/adb/modules/no_telephony_t860 && \
  find /data/adb/modules/no_telephony_t860 -type f -exec chmod 644 {} \;'"
adb reboot
```

### Verify

```bash
adb shell "pm list features | grep -c telephony"    # 8 before, 0 after
```

Lock screen confirmed clean afterwards — no "No service".

### Revert

```bash
adb shell "su -c 'rm -rf /data/adb/modules/no_telephony_t860'" && adb reboot
```

If a module ever prevents boot, hold **Volume Down** during startup for Magisk safe mode, which
disables all modules.

## L2 — Battery percentage in the status bar

### The trap

The obvious command does nothing:

```bash
adb shell settings put system status_bar_show_battery_percent 1     # accepted, ignored
```

It writes successfully, reads back as `1`, and **no percentage appears**. Restarting SystemUI does
not help either. `status_bar_battery_style` in the same namespace is likewise accepted and ignored.

### Why

LineageOS keeps its own settings in a **separate provider** — `content://lineagesettings/system` —
which `settings put system` never touches. The AOSP-namespace key of the same name is a decoy.

### The fix

```bash
adb shell "su -c 'content insert --uri content://lineagesettings/system \
  --bind name:s:status_bar_battery_style --bind value:s:2'"
```

Applies live, no reboot, no SystemUI restart.

### Style values, as measured on this build

| Value | Result |
|---|---|
| `0` | portrait icon, **no number** (even with `status_bar_show_battery_percent=1`) |
| `1` | circle icon; shows a charging bolt rather than a number while charging |
| `2` | **text — "100%"**. The only value that reliably shows the number |

Value `2` replaces the icon with the number rather than adding to it. On this build there is no
icon-plus-number combination; the AOSP percent setting does not compose with the Lineage style.

### Verify

```bash
adb shell "su -c 'content query --uri content://lineagesettings/system'" | grep battery_style
```

## Finding other Lineage-only settings

Anything exposed in LineageOS's own Settings screens likely lives in that provider, not AOSP's.
When a `settings put` is silently ignored, check there before concluding the feature is missing:

```bash
adb shell "su -c 'content query --uri content://lineagesettings/system'"
adb shell "su -c 'content query --uri content://lineagesettings/secure'"
```
