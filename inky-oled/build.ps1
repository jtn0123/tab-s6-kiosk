# Build the Wall Panel APK using only the Android SDK build-tools.
# No Gradle, no Maven, no network. Produces inkyoled.apk (debug-signed).
#
# Run:  powershell -File build.ps1

$ErrorActionPreference = 'Stop'

$SDK  = "$env:LOCALAPPDATA\Android\Sdk"
$BT   = "$SDK\build-tools\36.0.0"
$PLAT = "$SDK\platforms\android-36\android.jar"
$ROOT = $PSScriptRoot
$OUT  = "$ROOT\build"

foreach ($p in @("$BT\aapt2.exe", "$BT\d8.bat", "$BT\zipalign.exe", "$BT\apksigner.bat", $PLAT)) {
    if (-not (Test-Path $p)) { throw "Missing build tool: $p" }
}

Write-Host "=== clean ==="
if (Test-Path $OUT) { Remove-Item $OUT -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$OUT\compiled","$OUT\classes","$OUT\dex" | Out-Null

# --- minimal resources: launcher icon + nothing else -------------------------
$RES = "$OUT\res"
New-Item -ItemType Directory -Force -Path "$RES\mipmap-anydpi-v26","$RES\values" | Out-Null

# simple vector launcher icon so we do not need binary PNGs
@'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#101418" android:pathData="M0,0h108v108h-108z"/>
    <path android:fillColor="#6DB3F2"
        android:pathData="M26,34h56v6h-56z M26,50h34v6h-34z M26,64h44v6h-44z"/>
</vector>
'@ | Set-Content "$RES\mipmap-anydpi-v26\ic_launcher.xml" -Encoding UTF8

Write-Host "=== aapt2 compile ==="
& "$BT\aapt2.exe" compile --dir $RES -o "$OUT\compiled\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "=== aapt2 link ==="
& "$BT\aapt2.exe" link `
    -I $PLAT `
    --manifest "$ROOT\AndroidManifest.xml" `
    -A "$ROOT\assets" `
    --java "$OUT\gen" `
    -o "$OUT\base.apk" `
    "$OUT\compiled\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "=== javac ==="
$srcs = @(Get-ChildItem "$ROOT\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$gen  = @()
if (Test-Path "$OUT\gen") { $gen = @(Get-ChildItem "$OUT\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName }) }
$all = @($srcs) + @($gen)
Write-Host "  sources: $($all.Count)"
& javac -nowarn -classpath $PLAT -d "$OUT\classes" $all 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "=== d8 ==="
$classes = @(Get-ChildItem "$OUT\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& "$BT\d8.bat" --lib $PLAT --output "$OUT\dex" $classes 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "=== package ==="
Copy-Item "$OUT\base.apk" "$OUT\unsigned.apk" -Force
Push-Location "$OUT\dex"
& "$BT\aapt2.exe" version | Out-Null
# add classes.dex into the apk zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$OUT\unsigned.apk", 'Update')
foreach ($dex in (Get-ChildItem "$OUT\dex" -Filter *.dex)) {
    $entry = $zip.CreateEntry($dex.Name, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $fs = [System.IO.File]::OpenRead($dex.FullName)
    $fs.CopyTo($es); $fs.Close(); $es.Close()
    Write-Host "  added $($dex.Name)"
}
$zip.Dispose()
Pop-Location

Write-Host "=== zipalign ==="
& "$BT\zipalign.exe" -f -p 4 "$OUT\unsigned.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "=== sign ==="
$ks = "$ROOT\debug.keystore"
if (-not (Test-Path $ks)) {
    & keytool -genkeypair -keystore $ks -alias inkyoled -storepass android -keypass android `
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=InkyOLED,O=Local,C=US" 2>&1 | Write-Host
}
& "$BT\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android `
    --out "$ROOT\inkyoled.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Write-Host "`n=== verify ==="
& "$BT\apksigner.bat" verify --print-certs "$ROOT\inkyoled.apk" 2>&1 | Select-Object -First 4

$size = [math]::Round((Get-Item "$ROOT\inkyoled.apk").Length / 1KB, 1)
Write-Host "`nBUILT: $ROOT\inkyoled.apk  ($size KB)"
Write-Host "Install with:  adb install -r `"$ROOT\inkyoled.apk`""
