# Build the adaptive-brightness runtime resource overlay (RRO).
# Uses only the Android SDK build-tools - aapt2 -> zipalign -> apksigner.
# No Gradle, no Maven, no network.

$ErrorActionPreference = "Stop"

$SDK  = "$env:LOCALAPPDATA\Android\Sdk"
$BT   = "$SDK\build-tools\36.0.0"
$PLAT = "$SDK\platforms\android-36\android.jar"

$ROOT = $PSScriptRoot
$SRC  = "$ROOT\rro"
$OUT  = "$ROOT\build"
$KS   = "$ROOT\overlay.keystore"

foreach ($p in @("$BT\aapt2.exe", "$BT\zipalign.exe", "$BT\apksigner.bat", $PLAT)) {
    if (-not (Test-Path $p)) { throw "missing: $p" }
}

Remove-Item -Recurse -Force $OUT -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$OUT\compiled" | Out-Null

Write-Host "=== aapt2 compile ==="
& "$BT\aapt2.exe" compile --dir "$SRC\res" -o "$OUT\compiled\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "=== aapt2 link ==="
& "$BT\aapt2.exe" link `
    -I $PLAT `
    --manifest "$SRC\AndroidManifest.xml" `
    -o "$OUT\unaligned.apk" `
    "$OUT\compiled\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "=== zipalign ==="
& "$BT\zipalign.exe" -f -p 4 "$OUT\unaligned.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# A signing key is required for a valid APK. The overlay is installed into
# /product/overlay by a Magisk module rather than by PackageInstaller, so the
# key identity does not matter - it only has to be present and self-consistent.
if (-not (Test-Path $KS)) {
    Write-Host "=== generating signing key (first run) ==="
    & keytool -genkeypair -keystore $KS -storepass android -keypass android `
        -alias overlay -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=tab-s6-kiosk overlay, OU=none, O=none, L=none, S=none, C=US"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}

Write-Host "=== apksigner ==="
& "$BT\apksigner.bat" sign `
    --ks $KS --ks-pass pass:android --key-pass pass:android --ks-key-alias overlay `
    --out "$ROOT\autobrightness-overlay.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

$size = (Get-Item "$ROOT\autobrightness-overlay.apk").Length
Write-Host ""
Write-Host "BUILT: autobrightness-overlay.apk ($size bytes)"
