# Patch H — Wireless adb that survives reboots

## Why

Once the tablet is on the wall, plugging in USB is awkward. Also: **this tablet drops off USB
entirely whenever adbd restarts** (hit repeatedly this session). Wireless is the reliable path.

Normal `adb tcpip 5555` dies at reboot. This makes it stick.

## Apply (needs root)

```bash
adb root
adb shell setprop persist.adb.tcp.port 5555
adb reboot
```

Then connect any time with:

```bash
adb connect <tablet-ip>:5555
```

Make the tablet's IP static in your router, or this changes on you.

## ⚠️ Security

This leaves **an unauthenticated-ish adb port open on your LAN permanently**. Anyone on the network
who is already paired, or who can reach the port, has a shell on the tablet. On a home network with
a kitchen panel that is probably fine — but it is a real trade, so it is a deliberate choice, not a
default.

If you would rather not: Android's built-in **Wireless debugging** (Developer options) is more
secure — it uses TLS pairing — but it turns itself off on reboot and gives a new random port each
time, which is exactly the friction this patch removes.

## Revert

```bash
adb root
adb shell setprop persist.adb.tcp.port -1
adb reboot
```
