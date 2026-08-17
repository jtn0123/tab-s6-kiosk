# Inky OLED

A standalone **touch dashboard app** for the Galaxy Tab S6 kitchen panel.

Same idea as [InkyPi](https://github.com/fatihak/InkyPi) — plugin cards on a dashboard — but
**runs entirely on the tablet**. No Raspberry Pi, no server, no e-ink hardware. Rendered for a
colour AMOLED instead of e-paper, hence the name.

It is no longer a static repaint loop: every card opens a full-screen detail panel, the
stopwatch and timer really run, the Home Assistant tiles toggle, and the settings panel writes
preferences that survive a force-stop. **See [INTERACTIVE.md](INTERACTIVE.md)** for the widgets,
the gesture model, the JS bridge, the burn-in strategy and how to test it on a device.

Built and dogfooded in an Android 16 emulator configured to the Tab S6's exact panel:
**2560x1600 @ density 360** (what the device itself reports, and what the Device panel reads
back), then tuned against screenshots from the real tablet — which renders
**portrait** (1600x2560), because Samsung's large-screen policy ignores the manifest's
orientation request.

## Install

```bash
adb install -r inky-oled\inkyoled.apk
```

Open **Inky OLED** from the app drawer.

## Configure

Edit **`assets/config.js`**, then rebuild and reinstall.

**Location is currently a placeholder (Seattle).** Change it or you will get Seattle's weather:

```js
location: {
  name: "Kitchen",
  latitude:  47.6062,     // yours from https://www.latlong.net/
  longitude: -122.3321,
},
```

Set both to `null` to show a "set your location" notice instead.

Also configurable: `units` (fahrenheit/celsius), `clockHours` (12/24), `weatherRefreshMinutes`,
and `burnInProtection` (`enabled`, `intervalSeconds`, `maxShiftPx`).

`units`, `clockHours` and `burnInProtection.enabled` are only **defaults** now — the on-device
Settings panel owns them once the user touches it, and its choices persist. `plugins` is a
legacy starting hint; which widgets render is a per-widget switch in Settings.

## Build

```bash
powershell -File build.ps1
```

Uses **only the Android SDK build-tools** — aapt2 -> javac -> d8 -> zipalign -> apksigner.
No Gradle, no Maven, no network. Builds in seconds. Output ~69 KB.

## What it shows

Eight widgets, all interactive — tap a card for its full-screen detail panel.

- **Clock** — time, seconds, full date; panel adds time zone, day of year, ISO week, world clocks
- **Now** — temperature, conditions, feels-like, wind, humidity; panel adds pressure, dew point,
  visibility, UV, gusts, sunrise/sunset, precipitation
- **Next 24 hours** — scrollable hourly strip; tap an hour for its readout
- **Next days** — all 7 days; tap a day for its detail and an hour-by-hour chart
- **Home** — Home Assistant sensors: a labelled **demo simulator** by default, your own entities
  when a token is configured
- **Device** — real battery, storage, memory, network and uptime through a JS bridge
- **Timer** — stopwatch with laps, countdown with presets and a full-screen alarm
- **Settings** — units, clock format, seconds, burn-in, per-widget show/hide; persisted

Weather comes from **Open-Meteo — no API key, no account.**

## Home Assistant sensors (optional)

Shows your own room sensors — e.g. ESP32/MQTT nodes — instead of only outdoor weather.

**Without a token the card is not empty:** it runs a labelled `DEMO` simulator — nine entities on
a time-of-day model, with switches that hold state and feed back into it (the lamp warms the
living room and adds watts). That is what ships, since the repo is public.

To use a real Home Assistant, in `assets/config.js`:

```js
homeAssistant: {
  enabled: true,
  baseUrl: "http://homeassistant.local:8123",
  token: "<long-lived access token>",
  entities: [
    { id: "sensor.living_room_temperature", label: "Living room", unit: "°F" },
  ],
},
```

Create the token in HA under **Profile → Security → Long-Lived Access Tokens**; entity ids are
under **Developer Tools → States**. With `enabled`, `baseUrl` and `token` all set, the badge on
the card flips from `DEMO` to `live` and the widget polls the REST API; anything missing and it
falls back to the simulator.

> **The token grants full API access to your Home Assistant** and is stored in plain text inside
> the APK. Only sideload this build onto your own device, and never commit a real token — the
> repo's pre-commit scanner blocks it.

## Auto-start after reboot

A `BootReceiver` relaunches the dashboard on `BOOT_COMPLETED`.

**Caveat that matters:** since Android 10, apps cannot start activities from the background, so
this is silently dropped unless the app is exempt. Grant the exemption with:

```bash
adb shell appops set com.justin.inkyoled SYSTEM_ALERT_WINDOW allow
```

(or Settings → Apps → Inky OLED → Display over other apps).

The always-works alternative is making this the HOME launcher — deliberately not done here, since
the tablet is also a handheld video player and a launcher with no app drawer gets in the way.

## Screen-on behaviour

The app holds `FLAG_KEEP_SCREEN_ON` while in the foreground, so the screen stays on while the
dashboard shows and normal sleep returns the moment you switch to another app. **No global
settings needed** — see `patches/D-kiosk-settings/README.md`.

It also calls `setShowWhenLocked(true)` and `setTurnScreenOn(true)`, so one press of the power
button no longer strands the panel behind the lock screen — the dashboard comes back by itself.
**The keyguard is not bypassed:** it stays armed and still gates everything outside this
activity. The trade-off is that whatever the dashboard displays is readable without unlocking.
Details in [INTERACTIVE.md](INTERACTIVE.md#wall-panel-posture).

## Kiosk behaviour

- Fullscreen immersive: no status bar, no navigation bar
- Back closes the top detail panel and nothing else — it can never leave the app
- `FLAG_KEEP_SCREEN_ON` while showing; shown over the lock screen, keyguard still armed
- Manifest asks for landscape; the device renders portrait and the CSS is tuned for it, with a
  landscape fallback

## Why it looks like this

Tuned deliberately for an **AMOLED wall panel**:

- **Black background** — on OLED those pixels are genuinely off. Less power, far less burn-in risk
  than a bright dashboard.
- **Thin type, low coverage** — fewer lit pixels, still readable at 2-4 m.
- **Burn-in drift** — every layer that can be on screen for hours (dashboard, detail panels, the
  alarm overlay) shifts by the same few pixels every 2 minutes, so nothing sits on the same
  pixels. Skipped while a finger is down. See patch `I-burnin`.
- **Idle unwind** — an open panel returns to the dashboard after 90 s untouched, and a finished
  countdown's alarm clears itself after 60 s. Drift protects the pixels; this makes sure the
  dashboard is what is actually on them.

## Dogfooding notes (fixes already made)

Testing at real resolution caught things that looked fine on a small screen:

1. **~40% dead space.** `grid-template-rows: auto 1fr` stretched the forecast card to fill the
   column, marooning it in a huge empty box. Fixed with `auto auto` + `align-content: center`.
2. **Too small for distance viewing.** Sizes were tuned on a 640x320 emulator and were far too
   timid at 2560x1600. Clock went 21vh -> 27vh, weather and forecast scaled to match.

## Build gotchas worth remembering

- **Assets must stay FLAT** (no subdirectories). `aapt2` on Windows writes subdirectory separators
  as backslashes — `assets/dashboard\index.html` — which `file:///android_asset/` cannot resolve.
  Result is a silent black screen.
- **PowerShell array concat.** `$a + $b` on two single-element results concatenates *strings*.
  Use `@($a) + @($b)` or javac receives one fused filename.

## Adding a plugin

`assets/app.js` holds the shared plumbing (settings, panel stack, touch delegation, bridge,
formatting); the widgets themselves live in `assets/widgets.js`. Each is an object with
`init()`, and optionally `onOpen(panel, arg)` / `onClose()` for its detail panel.

1. Add `<section class="card tappable" data-widget="yourname" data-open="yourname">` to
   `index.html`, plus a `<section class="panel" data-panel="yourname">` shell in the panel layer
2. Add the object in `widgets.js` and `WP.register()` it
3. Add `"yourname"` to `WIDGETS` / `WIDGET_LABELS` in `app.js` so Settings can show and hide it

Controls inside a panel are markup, not listeners: `data-act="verb"` (with `data-arg` /
`data-ns`) is dispatched to your `WP.onAction` handler, and `data-close` pops the panel. Don't
attach your own click handler — it will not survive a long press. See
[INTERACTIVE.md](INTERACTIVE.md#interaction-model).

Two invariants are easy to break by accident and are written down as contracts: the **toast band**
(the toast takes over the status line on the dashboard and the panel subtitle inside a panel, and
never covers a control or a datum — [contract](INTERACTIVE.md#toast-placement)), and the **close
shadow** (a close tap suppresses only the `data-open` rect directly under it, for 600 ms — never a
blanket cooldown, which would re-break close-then-tap — [details](INTERACTIVE.md#panels)).

Sensible next cards: calendar, photo rotation, transit times, NAS status — or the Pi's InkyPi
output if you ever want the two linked.

## Not done yet

Auto-start on boot and screen pinning — patch-backlog items rather than app features. The
on-device settings UI is now built (widget #8). Untested paths: a real Home Assistant token, and
the offline/stale badge (verifying it means toggling the tablet's Wi-Fi, which drops the adb
transport).
