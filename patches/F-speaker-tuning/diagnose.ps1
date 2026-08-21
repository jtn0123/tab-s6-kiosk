# Patch F — SPEAKER TUNING INVESTIGATION (READ-ONLY DIAGNOSTIC)
#
# Goal: find out WHY the speakers sound worse on the GSI than they did on One UI, when all
# four are confirmed playing. Hypothesis: the Cirrus CS35L41 amps' onboard DSP (speaker
# protection + bass/loudness tuning) is not being loaded or enabled.
#
# THIS SCRIPT ONLY READS. It writes nothing and changes nothing. Run it, send me the output,
# and we decide what (if anything) is safe to change.
#
# REQUIRES ROOT: Developer options -> Root access -> "ADB only", then `adb root`.
# tinymix returns "Failed to open mixer" as the plain shell user.
#
# Run:  powershell -File diagnose.ps1 > speaker-report.txt

$ErrorActionPreference = 'Continue'

function Sec($t) { "`n" + ("=" * 70); "== $t"; ("=" * 70) }

$s = (adb get-state 2>&1)
if ($s -notmatch 'device') {
    "Tablet not connected (state: $s)"
    "USB: plug in, set 'Use USB for -> File transfer'."
    "Wireless: enable Wireless debugging, then 'adb mdns services' and 'adb connect <ip:port>'."
    exit 1
}

adb root 2>&1 | Out-Null
Start-Sleep -Seconds 4
$id = (adb shell id 2>&1)
if ($id -notmatch 'uid=0') {
    "NOT ROOT — enable Developer options -> Root access -> 'ADB only', then rerun."
    "  got: $id"
    exit 1
}
"root OK: $id"

Sec "1. Sound cards present"
adb shell "cat /proc/asound/cards" 2>$null

Sec "2. Cirrus / CS35L41 firmware files shipped in /vendor"
adb shell "ls -la /vendor/firmware/ 2>/dev/null | grep -i -E 'cs35|cirrus|spk|halo'" 2>$null
adb shell "find /vendor -iname '*cs35l41*' 2>/dev/null | head -40" 2>$null
adb shell "find /vendor -iname '*cirrus*' 2>/dev/null | head -20" 2>$null

Sec "3. Did the kernel actually LOAD that firmware? (the key question)"
adb shell "dmesg 2>/dev/null | grep -i -E 'cs35l41|cirrus|halo|wm_adsp' | tail -40" 2>$null

Sec "4. Calibration data present? (per-unit factory values)"
adb shell "ls -la /efs/cirrus* /mnt/vendor/efs/cirrus* /vendor/etc/cirrus* 2>/dev/null" 2>$null
adb shell "find / -iname '*cs35l41*cal*' -not -path '/proc/*' 2>/dev/null | head -10" 2>$null

Sec "5. FULL mixer control dump (this is the important one)"
adb shell "tinymix 2>/dev/null | head -400" 2>$null

Sec "6. DSP / firmware-related mixer controls"
adb shell "tinymix 2>/dev/null | grep -i -E 'dsp|halo|firmware|protect|cal|boost'" 2>$null

Sec "7. Gain / volume mixer controls"
adb shell "tinymix 2>/dev/null | grep -i -E 'gain|volume|digital|pcm|amp'" 2>$null

Sec "8. Current per-amp slot positions (routing set by phh-spkrot)"
foreach ($a in 'FL','FR','RL','RR') {
    $v = (adb shell "tinymix '$a ASPRX1 Slot Position'" 2>&1)
    "  $a ASPRX1 Slot Position : $v"
}

Sec "9. phh-spkrot service + its log"
adb shell "getprop | grep -i spkrot" 2>$null
adb shell "logcat -d -s phh-spkrot 2>/dev/null | tail -10" 2>$null

Sec "10. Audio HAL in use + effects available"
adb shell "getprop | grep -i -E 'audio.*hal|vendor.audio'" 2>$null
adb shell "dumpsys media.audio_flinger 2>/dev/null | grep -i -A2 'Effects\|libraries' | head -30" 2>$null

Sec "11. Audio policy config files present in /vendor"
adb shell "ls -la /vendor/etc/audio*  2>/dev/null" 2>$null

Sec "12. Current volume + output routing"
adb shell "dumpsys audio 2>/dev/null | grep -E 'STREAM_MUSIC|Devices:|speaker' | head -12" 2>$null

"`n`n=== END OF REPORT ==="
"Nothing was modified. Send this output back for analysis."
