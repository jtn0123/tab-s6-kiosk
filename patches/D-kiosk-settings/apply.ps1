# Patch D — usage-mode settings
#
# The tablet is used BOTH ways: sometimes a mounted dashboard, sometimes a handheld
# video player. These modes want opposite settings, so pick one rather than assuming.
#
#   powershell -File apply.ps1 -Mode panel     # mounted dashboard
#   powershell -File apply.ps1 -Mode tablet    # normal handheld tablet (default Android behaviour)
#   powershell -File revert.ps1                # restore whatever was there before
#
# No root needed. Values live in /data, so they survive GSI updates.

param(
    [ValidateSet('panel','tablet')]
    [string]$Mode = 'panel'
)

$ErrorActionPreference = 'Continue'

$s = (adb get-state 2>&1)
if ($s -notmatch 'device') {
    "Tablet not connected (state: $s)."
    "USB: plug in, then set 'Use USB for -> File transfer' on the tablet."
    "Wireless: enable Wireless debugging, then 'adb mdns services' and 'adb connect <ip:port>'."
    exit 1
}

$keys = @(
    @{ns='global'; k='stay_on_while_plugged_in'},
    @{ns='system'; k='screen_off_timeout'},
    @{ns='system'; k='accelerometer_rotation'},
    @{ns='system'; k='user_rotation'},
    @{ns='secure'; k='screensaver_enabled'}
)

# back up current values once, so revert always has something truthful to restore
$bp = "$PSScriptRoot\backup.json"
if (-not (Test-Path $bp)) {
    $backup = [ordered]@{}
    foreach ($e in $keys) {
        $backup["$($e.ns).$($e.k)"] = (adb shell settings get $($e.ns) $($e.k) 2>$null).Trim()
    }
    $backup | ConvertTo-Json | Set-Content $bp -Encoding UTF8
    "Backed up original values to backup.json"
} else {
    "backup.json already exists — keeping the original pre-patch values"
}

"`n=== Applying mode: $Mode ==="

if ($Mode -eq 'panel') {
    # Mounted dashboard: stay lit while powered, hold one orientation.
    adb shell settings put global stay_on_while_plugged_in 3      # AC|USB
    adb shell settings put system screen_off_timeout 1800000      # 30 min fallback
    adb shell settings put system accelerometer_rotation 0        # lock rotation
    adb shell settings put system user_rotation 1                 # 0=0deg 1=90 2=180 3=270
    adb shell settings put secure screensaver_enabled 0
    "  stay awake while charging, 30 min timeout, locked landscape, no screensaver"
    "`n  NOTE: a permanently-lit static dashboard on this AMOLED will ghost."
    "  See patch I. Inky OLED already drifts its layout to mitigate this."
}
else {
    # Handheld video player: behave like a normal tablet.
    adb shell settings put global stay_on_while_plugged_in 0      # allow sleep
    adb shell settings put system screen_off_timeout 600000       # 10 min
    adb shell settings put system accelerometer_rotation 1        # free rotation
    adb shell settings put secure screensaver_enabled 0
    "  normal sleep, 10 min timeout, auto-rotate ON"
}

"`n=== Result ==="
foreach ($e in $keys) {
    "  {0,-8} {1,-28} = {2}" -f $e.ns, $e.k, (adb shell settings get $($e.ns) $($e.k) 2>$null).Trim()
}

"`nSwitch any time by re-running with the other -Mode."
