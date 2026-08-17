# Patch G — Battery longevity

**Status: APPLIED and persistent. The node is `batt_full_capacity`.**

## Why this matters most of all the remaining patches

A wall panel is plugged in **24/7**. Holding a lithium battery at 100% and warm is the fastest way
to wear it out. On a Tab S6 that means a **swollen battery in a year or two** — which pushes the
screen out of the chassis and can crack it.

Keeping charge in the 20–80% band dramatically extends life. For a permanently-mounted tablet this
is the difference between "still fine in 5 years" and "binned in 2".

## What this device actually has

The diagnostic ruled out the usual suspects and found the good one:

| Node | Value found | Verdict |
|---|---|---|
| `batt_full_capacity` | `0` (off) | **This is the one.** Samsung's real charge limit — set it to a percentage and the firmware stops there |
| `batt_slate_mode` | `0` | present but cruder — a hard stop-charging toggle, needs polling logic |
| `store_mode` | `0` | retail demo mode, sticky on some devices — avoid |
| `batt_capacity_max` | `990` | scaling//reporting value, **not** a charge limit — do not touch |

`batt_full_capacity` is the right mechanism because the **firmware** enforces the target. No polling
daemon, no app watching the level, nothing to go wrong if a script dies.

Battery health at time of writing: `charge_full` = `charge_full_design` = `7040000` — **100%, zero
measured degradation.** So this is purely preventive, applied before any damage.

## Apply

Needs root (see [patch K](../K-magisk-root/) — `adb root` does not work on this device).

```bash
adb shell "su -c 'echo 80 > /sys/class/power_supply/battery/batt_full_capacity'"
```

Verify:

```bash
adb shell "su -c 'cat /sys/class/power_supply/battery/batt_full_capacity'"   # -> 80
```

## Make it persist

sysfs does not survive reboot. A Magisk boot script does:

```bash
adb push battery-cap.sh /data/local/tmp/battery-cap.sh
adb shell "su -c 'mkdir -p /data/adb/service.d && \
  cp /data/local/tmp/battery-cap.sh /data/adb/service.d/battery-cap.sh && \
  chmod 755 /data/adb/service.d/battery-cap.sh'"
```

`/data/adb/service.d/` runs late in boot, after `/data` is mounted. The script sleeps 30s first so
the power-supply driver is definitely up before writing.

## Revert

```bash
adb shell "su -c 'echo 0 > /sys/class/power_supply/battery/batt_full_capacity'"
adb shell "su -c 'rm /data/adb/service.d/battery-cap.sh'"
```

`0` means "no cap" — full charging returns.

## What you will see

The tablet charges to 80% and stops. It then runs down slightly and tops back up. **This is correct
behaviour, not a charging fault** — the reported level simply never reaches 100% again while the cap
is set.

## Related

If Patch D's `stay_on_while_plugged_in` is set, the screen stays lit continuously, which adds heat.
Heat plus a full charge is the worst case for battery wear. **These two patches interact** — capping
charge matters more if the display is always on.
