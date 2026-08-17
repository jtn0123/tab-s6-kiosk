# Inky OLED

A standalone dashboard app for the Galaxy Tab S6 kitchen panel.

Same idea as [InkyPi](https://github.com/fatihak/InkyPi) — plugin cards on a dashboard — but
**runs entirely on the tablet**. No Raspberry Pi, no server, no e-ink hardware. Rendered for a
colour AMOLED instead of e-paper, hence the name.

Built and dogfooded in an Android 16 emulator configured to the Tab S6's exact panel:
**2560x1600 @ density 300**.

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

Also configurable: `units` (fahrenheit/celsius), `clockHours` (12/24), which `plugins` render,
`weatherRefreshMinutes`, and `burnInProtection`.

## Build

```bash
powershell -File build.ps1
```

Uses **only the Android SDK build-tools** — aapt2 -> javac -> d8 -> zipalign -> apksigner.
No Gradle, no Maven, no network. Builds in seconds. Output ~17 KB.

## What it shows

- **Clock** — large time, AM/PM, full date
- **Now** — temperature, conditions, feels-like, humidity, location
- **Next days** — 4-day forecast with highs/lows
- **Home** *(optional)* — your own Home Assistant sensors

Weather comes from **Open-Meteo — no API key, no account.**

## Home Assistant sensors (optional)

Shows your own room sensors — e.g. ESP32/MQTT nodes — instead of only outdoor weather.

In `assets/config.js`:

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

Then add `"sensors"` to `plugins`. Create the token in HA under
**Profile → Security → Long-Lived Access Tokens**; entity ids are under
**Developer Tools → States**.

If Home Assistant is not enabled, the card hides itself rather than rendering an empty box.

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

The app holds `FLAG_KEEP_SCREEN_ON` while in the foreground and is locked landscape. So the screen
stays on while the dashboard shows, and normal sleep/rotation return the moment you switch to
another app. **No global settings needed** — see `patches/D-kiosk-settings/README.md`.

## Kiosk behaviour

- Fullscreen immersive: no status bar, no navigation bar
- Back button disabled
- `FLAG_KEEP_SCREEN_ON` while showing
- Locked to landscape

## Why it looks like this

Tuned deliberately for an **AMOLED wall panel**:

- **Black background** — on OLED those pixels are genuinely off. Less power, far less burn-in risk
  than a bright dashboard.
- **Thin type, low coverage** — fewer lit pixels, still readable at 2-4 m.
- **Burn-in drift** — the whole layout shifts a few pixels every 2 minutes, so nothing sits on the
  same pixels for hours. See patch `I-burnin`.

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

`assets/app.js` uses a small plugin pattern — each card is an object with `init()`.

1. Add `<section class="card" data-plugin="yourname">` to `index.html`
2. Add an object with `init()` in `app.js`
3. Add `"yourname"` to `plugins` in `config.js`

Sensible next cards: calendar, photo rotation, transit times, NAS status — or the Pi's InkyPi
output if you ever want the two linked.

## Not done yet

Auto-start on boot, on-device settings UI, screen pinning. These are patch-backlog items J-M
rather than app features.
