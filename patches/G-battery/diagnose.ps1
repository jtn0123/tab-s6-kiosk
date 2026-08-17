# Patch G — Battery longevity: find which charge-control node this tablet has.
# READ-ONLY. Changes nothing. Needs root.
#
# Run:  powershell -File diagnose.ps1 > battery-report.txt

$s = (adb get-state 2>&1)
if ($s -notmatch 'device') { "Tablet not connected (state: $s)"; exit 1 }

adb root 2>&1 | Out-Null
Start-Sleep -Seconds 4
$id = (adb shell id 2>&1)
if ($id -notmatch 'uid=0') { "NOT ROOT. Developer options -> Root access -> 'ADB only', then rerun."; exit 1 }
"root OK"

"`n=== Battery now ==="
adb shell "dumpsys battery | grep -E 'level|status|health|AC|USB'" 2>$null

"`n=== All power_supply nodes ==="
adb shell "ls /sys/class/power_supply/" 2>$null

"`n=== Charge-control candidates (which exist?) ==="
$nodes = @(
  '/sys/class/power_supply/battery/batt_slate_mode',
  '/sys/class/power_supply/battery/store_mode',
  '/sys/class/power_supply/battery/input_suspend',
  '/sys/class/power_supply/battery/battery_input_suspend',
  '/sys/class/power_supply/battery/charging_enabled',
  '/sys/class/power_supply/battery/batt_capacity_max',
  '/sys/class/power_supply/usb/present'
)
foreach ($n in $nodes) {
  $r = (adb shell "if [ -e $n ]; then echo -n 'EXISTS  val='; cat $n 2>/dev/null; else echo 'absent'; fi" 2>$null)
  "{0,-58} {1}" -f $n, $r
}

"`n=== Anything else charge-related ==="
adb shell "ls /sys/class/power_supply/battery/ 2>/dev/null | grep -i -E 'charg|slate|store|suspend|limit|cap'" 2>$null

"`n=== END ==="
"Nothing changed. Send battery-report.txt back."
