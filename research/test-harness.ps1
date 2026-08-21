# Display-config element safety harness.
# For each candidate XML: push -> reboot -> wait -> record boot success + dumpsys evidence.
# Goal: find which <displayConfiguration> elements are safe to add and which NPE the
# display thread (which bootloops system_server).
param(
    [string]$CaseDir = "research\cases",
    [string]$E       = "emulator-5554",
    [int]$BootTimeoutSec = 180
)

$adb = "adb"
$target = "/data/system/displayconfig/display_port_0.xml"   # /vendor/etc/displayconfig symlinks here
$results = @()

function Wait-Boot([int]$timeout) {
    $deadline = (Get-Date).AddSeconds($timeout)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 6
        $bc = ""
        try { $bc = (& $adb -s $E shell getprop sys.boot_completed 2>$null); if ($bc) { $bc = $bc.Trim() } } catch {}
        if ($bc -eq '1') { return $true }
    }
    return $false
}

function Ensure-Root {
    & $adb -s $E root 2>&1 | Out-Null
    Start-Sleep -Seconds 4
}

function Clear-Config {
    Ensure-Root
    & $adb -s $E shell "rm -f $target" 2>&1 | Out-Null
}

Write-Host "Waiting for emulator to be ready..."
if (-not (Wait-Boot $BootTimeoutSec)) { Write-Host "emulator not ready, abort"; exit 1 }

$cases = Get-ChildItem $CaseDir -Filter '*.xml' | Sort-Object Name
Write-Host "Found $($cases.Count) cases`n"

foreach ($c in $cases) {
    Write-Host ("=" * 60)
    Write-Host "CASE: $($c.Name)"
    Write-Host ("=" * 60)

    Ensure-Root
    & $adb -s $E push $c.FullName $target 2>&1 | Out-Null
    & $adb -s $E shell "chmod 644 $target" 2>&1 | Out-Null
    & $adb -s $E reboot 2>&1 | Out-Null
    Start-Sleep -Seconds 10

    $booted = Wait-Boot $BootTimeoutSec

    if ($booted) {
        $loaded = (& $adb -s $E shell "dumpsys display | grep -m1 mLoadedFrom" 2>$null)
        $hdr    = (& $adb -s $E shell "dumpsys display | grep -m1 'mHdrBrightnessData='" 2>$null)
        $dens   = (& $adb -s $E shell "wm density" 2>$null)
        $err    = (& $adb -s $E shell "logcat -d | grep -c 'FATAL EXCEPTION IN SYSTEM PROCESS'" 2>$null)
        $status = "BOOT OK"
        Write-Host "  $status"
        Write-Host "  loadedFrom : $($loaded -replace '\s+',' ')"
        Write-Host "  hdrData    : $(if ($hdr -match 'null') {'null'} else {'POPULATED'})"
        Write-Host "  density    : $($dens -replace '\s+',' ')"
        Write-Host "  fatals     : $($err)"
        $results += [pscustomobject]@{ Case=$c.Name; Boot=$status; Hdr=$(if ($hdr -match 'null'){'null'}else{'POPULATED'}); Density=($dens -replace '\s+',' '); Fatals=$err }
    } else {
        $status = "BOOTLOOP"
        Write-Host "  $status  <-- element set is UNSAFE"
        $trace = (& $adb -s $E shell "logcat -d | grep -A3 'FATAL EXCEPTION IN SYSTEM PROCESS' | head -6" 2>$null)
        Write-Host "  $trace"
        $results += [pscustomobject]@{ Case=$c.Name; Boot=$status; Hdr='n/a'; Density='n/a'; Fatals='FATAL' }
        # recover before next case
        Clear-Config
        & $adb -s $E reboot 2>&1 | Out-Null
        Start-Sleep -Seconds 10
        Wait-Boot $BootTimeoutSec | Out-Null
    }
    Write-Host ""
}

Write-Host ("=" * 60)
Write-Host "SUMMARY"
Write-Host ("=" * 60)
$results | Format-Table -AutoSize

# leave device clean
Clear-Config
& $adb -s $E reboot 2>&1 | Out-Null
Write-Host "`nConfig cleared, device rebooting clean."
