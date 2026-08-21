# Patch E — System-wide audio DSP (RootlessJamesDSP)

**Independent of every other patch.** A normal app install plus a one-time permission grant.
No root, no Magisk, no files in `/vendor`. **Survives GSI updates.**

## Why this exists

The four speakers already work correctly — `tabs6-gsi-fixes.zip` drives all four CS35L41 amps
and `phh-spkrot` keeps L/R correct through rotation (verified running on this tablet).

What is *missing* versus stock One UI is Samsung's audio **processing**: Dolby Atmos, their
EQ/tuning, UHQ upscaling. Those are One UI features and are **not recoverable on a GSI** — same
category as HDR. No Treble toggle brings them back.

### Correction to earlier notes in this project

The Treble audio toggles were previously described as "the primary lever for Tab S6 audio."
That was overstated. Researching what they actually do:

- **Use alternate audio policy** — primarily fixes **Bluetooth voice calls**, and the headphone
  jack on some devices
- **Enable stereo audio mode** — paired with the above for Bluetooth/audio issues

The SM-T860 is Wi-Fi only (no voice calls) and its speakers already work, so **these toggles are
unlikely to change speaker quality**. Still worth flipping if Bluetooth speakers misbehave.

Source: <https://xdaforums.com/t/how-to-configure-a-treble-gsi-properly.4564191/>

## What RootlessJamesDSP gives you

A full system-wide DSP chain — parametric EQ, convolution (impulse responses), bass boost,
virtual surround, compressor, limiter. It sidesteps Android's built-in effects API by using
**internal audio capture** to process other apps' audio streams.

- F-Droid: <https://f-droid.org/en/packages/me.timschneeberger.rootlessjamesdsp/>
- GitHub: <https://github.com/timschneeb/RootlessJamesDSP>

## IMPORTANT compatibility limits — read before installing

| App | Processed? |
|---|---|
| **SmartTube / YouTube / YouTube Music** | **YES** — your main use case is covered |
| Poweramp, Deezer, Amazon Music, Substreamer, Twitch | yes |
| **Brave / any Chrome-based browser** | **NO** — blocks audio capture |
| Spotify | no |

So: SmartTube playback gets processed, **Brave playback does not**. If the kiosk plays audio
through a WebView rather than SmartTube, this patch will not affect it. Worth knowing before
you invest time tuning it.

Also: **cannot coexist with Wavelet** or other apps using the DynamicsProcessing API. Pick one.

## Install

1. Install the APK (F-Droid or Play Store).
2. It needs a one-time permission that only adb or Shizuku can grant — the app walks you
   through this on first launch and shows the exact command for your build. Follow the app's
   own on-screen instructions rather than a command copied from here; the required permission
   has changed between releases.
3. Grant the notification/capture prompt on the tablet when asked.

## Revert

Uninstall the app. Nothing persists.

## If you want processing in Brave too

That requires a *rooted* DSP (classic JamesDSP or ViPER4Android as a Magisk module), which hooks
the audio HAL rather than capturing streams. Magisk is **not** installed on this tablet. Adding
it is possible (patch the boot image, flash via Odin) but is a meaningfully larger change than
this patch, and would need redoing after every GSI update.
