# Patch M — SD card that will not stop asking to be formatted

**Status: FIXED and verified.** 512 GB card mounted, writable, 468 GB free.

## The symptom

Android repeatedly prompts to format the SD card. You format it — from Android, from Windows, over
and over — and the prompt comes straight back. Nothing you do from the UI ever fixes it.

## The actual cause

The card is fine. The kernel can read it. **vold cannot be convinced that it can.**

```
vold: /dev/block/vold/public:179,1: LABEL="External" UUID="EABF-39E9" TYPE="exfat"
vold: public:179,1 unsupported filesystem exfat
StorageManagerService: android.os.ServiceSpecificException: (code -5)
```

vold decides whether a filesystem is supported by looking for its name in `/proc/filesystems`.
Samsung's kernel implements exFAT in a driver registered as **`sdfat`**, not `exfat`:

```
$ cat /proc/filesystems
...
	vfat
	msdos
	sdfat        <-- handles exFAT, but vold is looking for the literal string "exfat"
	ntfs
	f2fs
```

So the kernel mounts the card perfectly and vold refuses to ask it to. Proof — this succeeds while
vold is calling the same card unsupported:

```bash
mount -t sdfat -o ro /dev/block/vold/public:179,1 /mnt/sdtest    # works
```

**This is why reformatting never helps.** Android formats large cards as exFAT by default, so every
format lands back on the one filesystem vold will not accept. You are re-creating the problem each
time.

## The fix

Format the card as **ext4**, which vold does accept.

```bash
adb push format-sdcard.sh /data/local/tmp/
adb shell "su -c 'sh /data/local/tmp/format-sdcard.sh'"
```

The script **refuses to run if the card has any files on it** — it mounts read-only first and
counts entries, and aborts unless the card is empty. Back your data up yourself; this is not a
migration tool.

Afterwards:

```
public:179,1 mounted 10e24f8d-3f92-47fe-b13d-eb0f156109b1
/dev/block/vold/public:179,1   468G   96K  468G   1%  /mnt/media_rw/10e24f8d-...
```

## Why ext4 and not FAT32

FAT32 also works with vold, but has a **4 GB maximum file size**. On a 512 GB card in a device used
as a video player, that rules out a large share of films outright. ext4 has no practical limit.

**The trade:** an ext4 card is not readable by Windows or macOS without extra software. Load it over
the network, by MTP, or via `adb push` instead of a card reader. If you need the card to be readable
on a PC and you never store files over 4 GB, format `vfat` instead — change the `mke2fs` line.

## Could exFAT be kept instead?

Only by making the kernel expose a filesystem literally named `exfat`. The driver is built in, not a
module, so there is nothing to load, and `/proc/filesystems` is not writable. Patching vold to
accept `sdfat` would mean replacing a core system binary — far more invasive, and it would need
redoing after every GSI update. Reformatting the card is the proportionate fix.

## Note on Android's own "Format" button

Formatting from Settings would just produce exFAT again on a card this size. The prompt Android
shows you is, in a real sense, offering to recreate the bug.
