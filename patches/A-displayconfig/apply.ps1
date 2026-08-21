# Patch A — install the display config (density + HDR)
#
# !! HIGHEST-RISK PATCH IN THE SET !!
# A malformed file bootloops system_server. This script therefore refuses to install a file
# that is missing any of the five mandatory <hdrBrightnessConfig> children, and verifies the
# result after reboot.
#
# REQUIRES ROOT: Developer options -> Root access -> "ADB only", then this script calls adb root.
# /vendor is read-only at runtime, so it also needs `adb remount`.
#
# RECOVERY IF IT BOOTLOOPS ANYWAY: boot TWRP (Vol Up + Power) and delete
#   /vendor/etc/displayconfig/display_port_129.xml
# Do NOT count on adb — adb authorization needs system_server, which is what crashes.

$ErrorActionPreference = 'Continue'
$src    = "$PSScriptRoot\display_port_129.xml"
$target = "/vendor/etc/displayconfig/display_port_129.xml"

if (-not (Test-Path $src)) { Write-Host "Missing $src"; exit 1 }

Write-Host "=== Pre-flight validation ==="

[xml]$doc = Get-Content $src -Raw
$hdr = $doc.displayConfiguration.hdrBrightnessConfig
if ($hdr) {
    $mandatory = @('brightnessMap','brightnessIncreaseDebounceMillis',
                   'brightnessDecreaseDebounceMillis','screenBrightnessRampIncrease',
                   'screenBrightnessRampDecrease')
    $missing = @()
    foreach ($m in $mandatory) { if (-not $hdr.$m) { $missing += $m } }
    if ($missing.Count -gt 0) {
        Write-Host "REFUSING TO INSTALL — <hdrBrightnessConfig> is missing mandatory child(ren):"
        $missing | ForEach-Object { Write-Host "    $_" }
        Write-Host "Installing this WOULD BOOTLOOP the tablet (NPE in HdrBrightnessData.loadConfig)."
        exit 1
    }
    Write-Host "  hdrBrightnessConfig: all 5 mandatory children present  OK"
    if ($hdr.sdrHdrRatioMap) { Write-Host "  sdrHdrRatioMap present — HDR headroom will be > 1.0" }
    else { Write-Host "  WARNING: no sdrHdrRatioMap — config loads but HDR ceiling stays 1.0 (no effect)" }
} else {
    Write-Host "  no hdrBrightnessConfig block (density-only install)"
}
if ($doc.displayConfiguration.densityMapping) { Write-Host "  densityMapping present  OK" }

Write-Host "`n=== Connecting ==="
$s = (adb get-state 2>&1)
if ($s -notmatch 'device') { Write-Host "Tablet not connected (state: $s)"; exit 1 }

adb root 2>&1 | Out-Null
Start-Sleep -Seconds 4
$id = (adb shell id 2>&1)
if ($id -notmatch 'uid=0') {
    Write-Host "NOT ROOT. Enable Developer options -> Root access -> 'ADB only', then rerun."
    Write-Host "  got: $id"
    exit 1
}
Write-Host "  root OK"

adb remount 2>&1 | Select-Object -Last 3

Write-Host "`n=== Installing ==="
adb shell "mkdir -p /vendor/etc/displayconfig" 2>&1 | Out-Null
adb push $src $target 2>&1
adb shell "chmod 644 $target; ls -la $target" 2>&1

Write-Host "`nRebooting. If it does not come back within ~3 minutes, boot TWRP and delete:"
Write-Host "  $target"
adb reboot 2>&1 | Out-Null

Start-Sleep -Seconds 15
$deadline = (Get-Date).AddMinutes(3)
$booted = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 8
    $bc = ""
    try { $bc = (adb shell getprop sys.boot_completed 2>$null); if ($bc) { $bc = $bc.Trim() } } catch {}
    Write-Host "  $(Get-Date -Format 'HH:mm:ss') boot_completed=[$bc]"
    if ($bc -eq '1') { $booted = $true; break }
}

if (-not $booted) {
    Write-Host "`n*** DID NOT BOOT — BOOTLOOP ***"
    Write-Host "Boot TWRP (Vol Up + Power) and delete $target"
    exit 1
}

Write-Host "`n=== Verify ==="
adb shell "dumpsys display | grep -m1 mLoadedFrom" 2>$null
adb shell "dumpsys display | grep -m1 'highestHdrSdrRatio'" 2>$null
adb shell "wm density" 2>$null
Write-Host "`nIf mLoadedFrom points at display_port_129.xml, the patch is live."
