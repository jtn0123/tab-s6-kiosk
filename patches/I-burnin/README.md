# Patch I — OLED burn-in protection

## Why

The Tab S6 is **AMOLED**. A kitchen dashboard showing the same clock, same widgets, same layout
for hours a day will **permanently ghost** those elements into the panel. This is not reversible.

It is the single most likely way to ruin this tablet long-term — more likely than any software
problem in this project.

## What actually helps, in order of effect

**1. Do not leave the screen on 24/7.**
Patch D's `stay_on_while_plugged_in` keeps it lit permanently. That is the worst case. Better:
let it sleep and wake on motion/touch, or schedule screen-off overnight.

```bash
# turn OFF permanent stay-awake
adb shell settings put global stay_on_while_plugged_in 0
# sleep after 10 minutes instead
adb shell settings put system screen_off_timeout 600000
```

**2. Dark theme.** Fewer lit pixels, less wear, and OLED blacks are genuinely off.

```bash
adb shell settings put secure ui_night_mode 2
```

**3. Lower brightness.** Wear scales with brightness. After the Treble fix there is plenty of
headroom, so it does not need to sit high.

**4. Move the content.** The real fix is in the kiosk app (phase 2): shift the layout by a few
pixels every few minutes, avoid static bright elements, avoid pure-white backgrounds, and do not
put a permanent status bar or fixed clock in one spot.

## The honest trade

A wall panel you have to touch to wake is less useful than one that is always on. There is no
setting that removes this trade-off — only the kiosk app can, by keeping pixels moving.

If you want always-on, at minimum use dark theme, low brightness, and design the dashboard so
nothing bright stays in one place.

## Revert

```bash
adb shell settings put secure ui_night_mode 0
```
Screen timeout / stay-awake: see Patch D's `revert.ps1`.
