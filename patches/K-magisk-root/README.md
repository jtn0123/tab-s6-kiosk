# Patch K — Real root, via Magisk

**Do this before patches A, B, F, G. `adb root` does not work on this device, and trying it costs
you a reboot every time.**

## The problem

`adb root` restarts adbd. On this tablet, the vendor USB gadget HAL loses the re-enumeration race
and **the device disappears from USB completely** — Windows stops enumerating it at all, not just
adb. Worse, the wireless TLS server does not come back either, so both transports die at once.

Confirmed three separate times in one session, each needing a full reboot to recover. The message
is friendly and the outcome is total:

```
$ adb root
restarting adbd as root
$ adb devices
List of devices attached
              <- nothing. USB and wireless both gone until reboot.
```

There is no workaround at the adbd level. The fix is to not need adbd's root at all.

## The fix

Magisk patches the **boot image**, so root comes from `su` inside a normal shell. adbd never
restarts, so nothing ever drops.

### 1. Get the stock boot image

It lives inside the AP tar of the stock firmware:

```bash
unzip SAMFW.COM_SM-T860_*_fac.zip "AP_*.tar.md5"
tar -xvf AP_*.tar.md5 boot.img.lz4
```

### 2. Decompress it — Magisk cannot read Samsung's `.lz4`

This is the step that trips people up. Handing Magisk the `.lz4` gives
**"unable to unpack boot image"**. Decompress it on the PC first:

```bash
lz4 -d boot.img.lz4 boot.img
```

Verify before continuing — the first 8 bytes must read `ANDROID!`:

```bash
xxd boot.img | head -1     # 00000000: 414e 4452 4f49 4421  ANDROID!
```

Expect a 64 MB file.

### 3. Patch on-device

```bash
adb install -r Magisk-v30.7.apk
adb push boot.img /sdcard/Download/boot.img
```

In the Magisk app: **Install → Select and Patch a File → Download/boot.img → LET'S GO**.
Output lands in `Download/` as `magisk_patched-XXXXX_YYYYY.img`.

### 4. Flash it from TWRP

TWRP's adb already runs as root, so this needs no taps and no `adb root`:

```bash
adb pull /sdcard/Download/magisk_patched-30700_aKpWs.img .
adb reboot recovery
adb wait-for-recovery

adb push magisk_patched-30700_aKpWs.img /tmp/boot_new.img
adb shell "md5sum /tmp/boot_new.img"
adb shell "dd if=/tmp/boot_new.img of=/dev/block/sda20 bs=4096 && sync"
adb shell "dd if=/dev/block/sda20 bs=4096 count=16384 | md5sum"   # must match above
adb reboot
```

`/dev/block/sda20` is `boot` on this device — **verify it rather than trusting this number**:

```bash
adb shell "ls -l /dev/block/bootdevice/by-name/boot"
```

### 5. Confirm

```bash
adb shell "su -c id"
# uid=0(root) gid=0(root) groups=0(root) context=u:r:magisk:s0
```

The first `su` raises a Magisk **Superuser Request** prompt on the tablet — tap **Grant**.

## Keep the images

Archive both the stock `boot.img` and the patched one. The stock image is your way back:

```bash
adb shell "su -c 'dd if=/path/to/stock/boot.img of=/dev/block/sda20'"   # from TWRP
```

## Pin wireless adb while you are here

With root, the wireless port stops being a moving target. Android's Wireless debugging normally
picks a **random port each time** and the Settings UI on this GSI sometimes fails to display it at
all — which makes reconnecting genuinely painful.

```bash
adb shell "su -c 'setprop persist.adb.tls_server.port 5555; settings put global adb_wifi_enabled 1'"
```

Now it is always `adb connect <tablet-ip>:5555`. See [patch H](../H-wireless-adb/).

## Finding the port without root (worth knowing)

If you ever need the wireless port before having root, do not scan and do not squint at the
Settings screen. adbd logs it, and `shell` is in the `log` group:

```bash
adb shell "logcat -d | grep -E 'adbwifi started|TlsServer running'"
# I adbd: adbwifi started on port 33949
```

mDNS discovery (`adb mdns services`) is unreliable here — many networks filter multicast, and it
silently returns an empty list rather than an error.

## ⚠️ Trade-offs

- Knox is **already** tripped by the bootloader unlock, so Magisk costs nothing extra there.
- Play Integrity will fail — banking apps and some DRM may refuse to run. Widevine is already L3 on
  this device, so streaming quality is not further affected.
- Keep the stock boot image. It is the only clean way back.
