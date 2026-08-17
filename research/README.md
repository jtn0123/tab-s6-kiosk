# Research

Working notes and test artifacts from figuring out whether HDR could be restored on a GSI.

## AOSP sources are NOT vendored here

Three files used during this investigation are Google's, Apache-2.0 licensed. They are
`.gitignore`d rather than committed. Re-fetch them if you want to follow the analysis:

```
services/core/xsd/display-device-config/display-device-config.xsd
services/core/java/com/android/server/display/DisplayDeviceConfig.java
services/core/java/com/android/server/display/config/HdrBrightnessData.java
```

all from `https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/`
(append `?format=TEXT` for base64 raw).

## What's here

| File | What it is |
|---|---|
| `analyze_schema.py` | Parses the AOSP XSD: proves it is **not strict-valid** (lxml rejects Google's non-standard `<xs:annotation name=...>`), and enumerates which elements are nominally required |
| `test-harness.ps1` | Pushes each case to an emulator, reboots, records boot success + dumpsys evidence, auto-recovers from bootloops |
| `cases/` | Six test configs — see table below |
| `display_port_0.xml` | The minimal config that worked, for the emulator's port 0 |
| `display_port_0_BAD.xml` | Deliberately malformed — reproduces the bootloop |
| `display_port_129.xml` | Early draft for the real tablet; the shipping version is `patches/A-displayconfig/` |

## Test results (Android 16 emulator, `android-36-ext19`)

| Case | Boot | HDR data | `highestHdrSdrRatio` | Density |
|---|---|---|---|---|
| 01 densityMapping only | OK | absent | — | 160 → **200** |
| 02 hdrBrightnessConfig only | OK | populated | **4.0** | 160 |
| 03 density + HDR | OK | populated | **4.0** | **200** |
| 04 autoBrightness only | OK | absent | — | 160 |
| 05 wrong element order | OK | populated | **4.0** | **200** |
| 06 HDR minus `sdrHdrRatioMap` | OK | populated | **1.0** | 160 |

### Conclusions

1. **`sdrHdrRatioMap` is solely what supplies HDR headroom.** Case 06 vs 02 isolates it — same
   block, one element removed, ratio drops 4.0 → 1.0. A config without it is valid, boots, and
   does nothing. That is the stock GSI state expressed as a file.
2. **The XSD's "required" elements are not enforced.** AOSP's own
   `/system/etc/displayconfig/default_television.xml` ships containing only `<densityMapping>`.
3. **Element order is irrelevant** — `xsdc` is order-tolerant.
4. **But five children of `hdrBrightnessConfig` genuinely are mandatory.** `loadConfig()`
   dereferences each with no null check; omitting one throws NPE inside `system_server` and
   **bootloops the device**. Reproduced deliberately (`display_port_0_BAD.xml`), stack trace
   captured, recovered by deleting the file.

### Not settled by emulation

Whether the Tab S6's composer actually boosts highlights. The emulator's display reports
`mSupportedHdrTypes=[]`, so it can never produce an HDR layer; the Tab S6 reports `[2,3,4]`.
Everything up to that final step is verified.
