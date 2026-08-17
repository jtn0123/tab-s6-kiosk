# Patch D — kiosk / wall-panel behaviour settings
# Independent of every other patch. No root needed, no files written, fully reversible.
# These are Settings values in /data, so they SURVIVE GSI updates.
#
# Run:    powershell -File apply.ps1
# Revert: powershell -File revert.ps1

$ErrorActionPreference = 'Continue'

function Need-Device {
    $s = (adb get-state 2>&1)
    if ($s -notmatch 'device') {
        Write-Host "Tablet not connected (state: $s)."
        Write-Host "USB: plug in, then set 'Use USB for -> File transfer' on the tablet."
        Write-Host "Wireless: enable Wireless debugging, then 'adb mdns services' and 'adb connect <ip:port>'."
        exit 1
    }
}
Need-Device

Write-Host "=== Recording current values (for revert) ==="
$backup = [ordered]@{}
$keys = @(
    @{ns='global'; k='stay_on_while_plugged_in'},
    @{ns='system'; k='screen_off_timeout'},
    @{ns='system'; k='accelerometer_rotation'},
    @{ns='system'; k='user_rotation'},
    @{ns='secure'; k='screensaver_enabled'}
)
foreach ($e in $keys) {
    $v = (adb shell settings get $($e.ns) $($e.k) 2>$null).Trim()
    $backup["$($e.ns).$($e.k)"] = $v
    "  {0,-8} {1,-28} = {2}" -f $e.ns, $e.k, $v
}
$backup | ConvertTo-Json | Set-Content "$PSScriptRoot\backup.json" -Encoding UTF8
Write-Host "`nSaved to backup.json`n"

Write-Host "=== Applying ==="

# Stay awake while charging. 3 = AC | USB (bitmask: 1=AC, 2=USB, 4=wireless).
# For a permanently-plugged wall panel this is the single most important setting.
adb shell settings put global stay_on_while_plugged_in 3
Write-Host "  stay_on_while_plugged_in = 3   (AC|USB — screen stays on while powered)"

# Long screen timeout as a belt-and-braces fallback for moments it is unplugged.
# 1800000 ms = 30 min. Deliberately NOT Int32.MAX — some OEM code mishandles that.
adb shell settings put system screen_off_timeout 1800000
Write-Host "  screen_off_timeout = 1800000   (30 min)"

# Lock rotation to landscape. user_rotation: 0=0deg 1=90 2=180 3=270.
# Change user_rotation to suit how the tablet is physically mounted.
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
Write-Host "  accelerometer_rotation = 0, user_rotation = 1   (locked landscape)"

# No screensaver / daydream on a wall panel.
adb shell settings put secure screensaver_enabled 0
Write-Host "  screensaver_enabled = 0"

Write-Host "`n=== Result ==="
foreach ($e in $keys) {
    $v = (adb shell settings get $($e.ns) $($e.k) 2>$null).Trim()
    "  {0,-8} {1,-28} = {2}" -f $e.ns, $e.k, $v
}

Write-Host "`nNOTE: 'stay_on_while_plugged_in' keeps the DISPLAY on continuously."
Write-Host "On an AMOLED that risks burn-in for a static dashboard. If the panel will show"
Write-Host "fixed UI for hours, prefer a screen-off schedule or a WebView that shifts pixels,"
Write-Host "rather than leaving this on indefinitely."
