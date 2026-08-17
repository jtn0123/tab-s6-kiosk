# Patch G — Battery longevity

## Why this matters most of all the remaining patches

A wall panel is plugged in **24/7**. Holding a lithium battery at 100% and warm is the fastest way
to wear it out. On a Tab S6 that means a **swollen battery in a year or two** — which pushes the
screen out of the chassis and can crack it.

Keeping charge in the 20–80% band dramatically extends life. For a permanently-mounted tablet this
is the difference between "still fine in 5 years" and "binned in 2".

## How it works

Samsung/Qualcomm devices expose a sysfs file that stops charging. Which one exists varies:

| Node | Behaviour |
|---|---|
| `batt_slate_mode` | Samsung. `1` = stop charging, `0` = resume |
| `store_mode` | Samsung retail-demo mode. Freezes the level until unplugged |
| `input_suspend` / `battery_input_suspend` | Qualcomm. `1` = cut charge input |
| `batt_capacity_max` | Reports 100% early (e.g. `800` = real 80%) |

The SM-T860 is Snapdragon 855, so `input_suspend` is likely — but it has to be checked.

## Step 1 — diagnose (do this first)

```bash
powershell -File diagnose.ps1 > battery-report.txt
```

**Read-only, changes nothing.** Needs root. Send the report back and we pick the right node.

## Step 2 — apply (after we know which node exists)

Not written yet, deliberately. Two possible approaches once the node is known:

- **App:** "Battery Charge Limit" (root) — set 80%, it handles the polling
- **Script:** a small init service that watches level and toggles the node

## ⚠️ Caveats

- **Do not guess the node.** Writing to the wrong power-supply file can stop charging entirely, or
  freeze the reported level so the tablet looks stuck at some percentage.
- **`store_mode` is sticky on some devices** — it can require unplugging for several seconds to
  clear. Prefer `slate_mode` or `input_suspend` if present.
- With charging capped, the tablet runs off battery down to your lower limit, then recharges. That
  is normal and correct — it is not "failing to charge".

## Related

If Patch D's `stay_on_while_plugged_in` is set, the screen stays lit continuously, which adds heat.
Heat plus a full charge is the worst case for battery wear. **These two patches interact** — capping
charge matters more if the display is always on.
