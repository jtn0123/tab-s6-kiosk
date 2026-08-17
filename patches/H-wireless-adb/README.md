# Patch H — Wireless adb that survives reboots

## Why

Once the tablet is on the wall, plugging in USB is awkward. And on this device USB is actively
unreliable: **it drops off USB entirely whenever adbd restarts** (see
[patch K](../K-magisk-root/) — this is why `adb root` is unusable here).

Android's built-in Wireless debugging is TLS-paired and secure, but it picks a **random port every
time** and turns itself off on reboot. On this GSI the Settings screen also sometimes fails to
render the port at all, leaving no way to read it from the UI.

This pins the port and keeps the service on.

## Apply (needs root — [patch K](../K-magisk-root/))

```bash
adb shell "su -c 'setprop persist.adb.tls_server.port 5555; settings put global adb_wifi_enabled 1'"
```

Then connect any time:

```bash
adb connect <tablet-ip>:5555
```

Verify it stuck:

```bash
adb shell "su -c 'getprop persist.adb.tls_server.port; settings get global adb_wifi_enabled'"
# 5555
# 1
```

Make the tablet's IP static in your router, or the address changes on you.

## Why `persist.adb.tls_server.port`, not `persist.adb.tcp.port`

`persist.adb.tcp.port` enables **legacy** unencrypted adb-over-TCP. It works, but it accepts any
host that has an authorised key with no pairing step.

`persist.adb.tls_server.port` pins the port of the **modern TLS** wireless debugging service, so you
keep certificate pairing *and* get a stable port. Same convenience, meaningfully better security —
prefer it.

## If you need the port before you have root

adbd logs it at startup, and `shell` is in the `log` group, so no root required:

```bash
adb shell "logcat -d | grep -E 'adbwifi started|TlsServer running'"
# I adbd: adbwifi started on port 33949
```

Toggling Wireless debugging off/on regenerates the port and logs the new one.

**Do not rely on `adb mdns services`** — it returns an empty list on networks that filter multicast,
with no error to distinguish "filtered" from "nothing there". Port-scanning works but is slow and
can miss the window entirely if the service is not actually listening.

## ⚠️ Security

This leaves a **paired adb service reachable on your LAN permanently**. TLS pairing means a random
device cannot just connect — but any host already paired has a root-capable shell on the tablet.

On a home network with a kitchen panel that is a reasonable trade. It is still a deliberate choice,
not a default.

## Revert

```bash
adb shell "su -c 'setprop persist.adb.tls_server.port -1'"
adb shell "su -c 'settings put global adb_wifi_enabled 0'"
```
