# Revert Patch D using backup.json written by apply.ps1
$ErrorActionPreference = 'Continue'

$bp = "$PSScriptRoot\backup.json"
if (-not (Test-Path $bp)) { Write-Host "backup.json not found — nothing to revert from."; exit 1 }

$s = (adb get-state 2>&1)
if ($s -notmatch 'device') { Write-Host "Tablet not connected (state: $s)"; exit 1 }

$backup = Get-Content $bp -Raw | ConvertFrom-Json
foreach ($p in $backup.PSObject.Properties) {
    $parts = $p.Name.Split('.')
    $ns = $parts[0]; $k = $parts[1]; $v = $p.Value
    if ($v -eq 'null' -or [string]::IsNullOrWhiteSpace($v)) {
        adb shell settings delete $ns $k | Out-Null
        "  deleted $ns $k  (was unset)"
    } else {
        adb shell settings put $ns $k $v | Out-Null
        "  restored $ns $k = $v"
    }
}
Write-Host "`nReverted."
