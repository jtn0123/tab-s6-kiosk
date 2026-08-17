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

## Proof the cap is actually enforced

`batt_full_capacity` is a Samsung vendor-kernel node, so it is fair to ask whether it still does
anything under a GSI. It does — toggling it flips the charger within seconds:

| `batt_full_capacity` | `status` | `current_now` |
|---|---|---|
| **80** (cap on) | `Not charging` | **17 mA** |
| **0** (cap off) | `Charging` | **408 mA** |
| **80** (restored) | `Not charging` | **17 mA** |

Reproduce it yourself while plugged in:

```bash
adb shell "su -c 'cd /sys/class/power_supply/battery; \
  echo 0 > batt_full_capacity; sleep 6; echo \"off: \$(cat status) \$(cat current_now)\"; \
  echo 80 > batt_full_capacity; sleep 6; echo \"on:  \$(cat status) \$(cat current_now)\"'"
```

### Reading the state correctly

Two things confuse people into thinking the cap failed:

**The level still shows 100%.** The node stops charging *above* the threshold; it cannot discharge
the cell. If the battery was full when you applied the cap, it stays full until you actually use
the tablet. Once it drops below 80% it charges back to 80% and holds. Nothing is wrong.

**`status` reads `Not charging`, not `Full`.** That is the signature of the cap actively holding
the charger off. A normally-terminated full battery reports `Full`. If you see `Not charging` with
the charger plugged in, the cap is doing its job.

### What the test incidentally showed

With the cap off at "100%", the tablet still drew **408 mA** — it was trickle-topping a cell it
considered full. That continuous top-up at maximum charge, warm, forever, is exactly the wear this
patch exists to prevent.

## "The cap is set but it still says 100%"

This is the most common way to conclude the cap is broken. It isn't.

`batt_full_capacity` stops charging **above** its threshold. It cannot discharge the cell. And a
plugged-in tablet runs off USB power, so the battery is never drawn down — there is nothing to
"drift" toward 80%. If the battery was full when you set the cap, it stays full indefinitely.

The cap only takes effect on the way **up**: once the level falls below 80% it charges back to 80%
and holds. You just have to get it into that band once.

### Getting there without unplugging: `drain-to-cap.sh`

Samsung's kernel exposes `batt_slate_mode`, which makes the device run **from the battery while
still plugged in**:

| `batt_slate_mode` | `status` | `current_now` |
|---|---|---|
| 0 | `Not charging` | +17 mA |
| 1 | **`Discharging`** | **−600 to −1200 mA** |

```bash
adb push drain-to-cap.sh /data/local/tmp/
adb shell "su -c 'setsid sh /data/local/tmp/drain.sh 80 </dev/null >/data/local/tmp/drain.log 2>&1 &'"
adb shell "su -c 'tail -f /data/local/tmp/drain.log'"
```

Roughly 7 minutes per percentage point (~600 mA against a 7040 mAh cell), so 100% → 80% takes about
2¼ hours. Faster with the screen on, which pushes it past 1200 mA.

### The safety design, and why each piece is there

Leaving slate mode on with nothing watching would drain the tablet flat, so:

- **`FLOOR=70`** — a hard stop independent of the target, in case the target is wrong or a level
  read is garbage.
- **`MAX_ITERS=600`** (5 h) — a backstop against a wedged loop. Sized deliberately: an earlier
  2-hour bound stopped at ~84%, short of the target, because the drain rate makes 20% take longer
  than that.
- **`trap cleanup EXIT INT TERM`** — slate mode is cleared on any normal exit, Ctrl-C, or `kill`.
- **slate mode re-asserted every pass** — this one is not paranoia. Running two copies of the
  script at once is easy to do by accident; when the first exits, its trap clears slate mode and
  the *other* copy keeps counting against a tablet that quietly stopped discharging. Re-asserting
  each iteration makes the loop self-healing.

**`kill` alone is not enough to stop it.** The loop spends its life inside `sleep 30`, and the shell
defers the signal until that returns, so a `kill` appears to do nothing for up to 30 seconds. If you
`kill -9`, the trap **cannot** run — clear slate mode yourself:

```bash
adb shell "su -c 'echo 0 > /sys/class/power_supply/battery/batt_slate_mode'"
```

### Verify it finished cleanly

```bash
adb shell "su -c 'cd /sys/class/power_supply/battery; \
  echo level=$(cat capacity) slate=$(cat batt_slate_mode) status=$(cat status)'"
```

Want: level ≈ 80, **slate=0**, status `Not charging`. A non-zero slate with no script running means
the tablet is still discharging and nothing is watching it.
