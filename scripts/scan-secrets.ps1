# Secret / PII scanner for this repo.
# Self-contained - no install required. Run before pushing, or wire it as a pre-commit hook.
#
#   powershell -File scripts/scan-secrets.ps1              # scan tracked files
#   powershell -File scripts/scan-secrets.ps1 -All         # scan everything on disk, tracked or not
#   powershell -File scripts/scan-secrets.ps1 -Staged      # scan only staged changes (hook mode)
#
# Exit code 0 = clean, 1 = findings.

param(
    [switch]$All,
    [switch]$Staged
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path $PSScriptRoot -Parent

# --- what counts as a secret ------------------------------------------------
$rules = @(
    @{ name='AWS access key';        re='AKIA[0-9A-Z]{16}' },
    @{ name='AWS secret key';        re='(?i)aws(.{0,20})?secret(.{0,20})?[=:]\s*[''"][0-9a-zA-Z/+]{40}[''"]' },
    @{ name='GitHub token';          re='gh[pousr]_[A-Za-z0-9]{36,}' },
    @{ name='GitHub fine-grained';   re='github_pat_[A-Za-z0-9_]{22,}' },
    @{ name='Google API key';        re='AIza[0-9A-Za-z_\-]{35}' },
    @{ name='OpenAI key';            re='sk-[A-Za-z0-9]{20,}' },
    @{ name='Anthropic key';         re='sk-ant-[A-Za-z0-9\-_]{20,}' },
    @{ name='Slack token';           re='xox[baprs]-[A-Za-z0-9\-]{10,}' },
    @{ name='Private key block';     re='-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY' },
    @{ name='JWT';                   re='eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.' },
    @{ name='Generic api key assign';re='(?i)\b(api[_\-]?key|apikey|access[_\-]?token|auth[_\-]?token|bearer)\b\s*[=:]\s*[''"][A-Za-z0-9_\-]{16,}[''"]' },
    @{ name='Password assignment';   re='(?i)\b(password|passwd|pwd|secret)\b\s*[=:]\s*[''"][^''"\s]{6,}[''"]' },
    @{ name='Home Assistant token';  re='(?i)\b(hass|homeassistant|ha)[_\-]?token\b\s*[=:]\s*[''"][^''"\s]{20,}[''"]' },
    @{ name='Connection string';     re='(?i)(mongodb|postgres|postgresql|mysql|redis)://[^\s''"]{0,40}:[^\s''"@]{3,}@' }
)

# --- what counts as PII for THIS project ------------------------------------
$pii = @(
    @{ name='Email address';         re='[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.(com|net|org|io|dev|co)\b' },
    @{ name='Private LAN IP';        re='\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b' },
    @{ name='Android device serial'; re='\bR5[0-9A-Z]{9}\b' },
    @{ name='Local user path';       re='(?i)C:\\Users\\(?!<)[A-Za-z0-9._\-]+\\' },
    @{ name='Wi-Fi PSK-ish';         re='(?i)\b(psk|wpa|wifi[_\-]?pass)\b\s*[=:]\s*\S{8,}' }
)

# allowlist - documented placeholders and public examples, not real secrets
$allow = @(
    'example\.com', 'user@example', 'placeholder', '<tablet-ip>', '<nas-ip>', '<SERIAL>',
    'noreply@', '10\.0\.0\.', '192\.168\.1\.1\b',
    'jtn0123@users\.noreply\.github\.com'
)

# --- pick the file list -----------------------------------------------------
Push-Location $repo
if ($Staged) {
    $files = @(git diff --cached --name-only --diff-filter=ACM 2>$null)
} elseif ($All) {
    $files = @(Get-ChildItem $repo -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.git\\' } |
        ForEach-Object { $_.FullName.Substring($repo.Length + 1) })
} else {
    $files = @(git ls-files 2>$null)
}
Pop-Location

# skip binaries and things we never want to read
$skipExt = @('.png','.jpg','.jpeg','.gif','.apk','.idsig','.keystore','.zip','.7z','.tar','.img','.bin','.jar','.dex','.ico','.pdf','.woff','.woff2')

$findings = @()
$scanned = 0

foreach ($rel in $files) {
    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
    $full = Join-Path $repo $rel
    if (-not (Test-Path $full -PathType Leaf)) { continue }
    if ($skipExt -contains ([IO.Path]::GetExtension($rel).ToLower())) { continue }
    if ((Get-Item $full).Length -gt 2MB) { continue }

    $scanned++
    $lineNo = 0
    foreach ($line in (Get-Content $full -ErrorAction SilentlyContinue)) {
        $lineNo++
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $allowed = $false
        foreach ($a in $allow) { if ($line -match $a) { $allowed = $true; break } }
        if ($allowed) { continue }

        foreach ($r in ($rules + $pii)) {
            if ($line -match $r.re) {
                $sev = if ($rules -contains $r) { 'SECRET' } else { 'PII' }
                $snip = $line.Trim()
                if ($snip.Length -gt 90) { $snip = $snip.Substring(0,90) + '...' }
                $findings += [pscustomobject]@{
                    Severity = $sev; Rule = $r.name; File = $rel; Line = $lineNo; Text = $snip
                }
            }
        }
    }
}

Write-Host ""
Write-Host ("=" * 74)
Write-Host " Secret / PII scan - $scanned files scanned"
Write-Host ("=" * 74)

if ($findings.Count -eq 0) {
    Write-Host " CLEAN - nothing found."
    Write-Host ""
    exit 0
}

$secrets = @($findings | Where-Object { $_.Severity -eq 'SECRET' })
$piiHits = @($findings | Where-Object { $_.Severity -eq 'PII' })

if ($secrets.Count) {
    Write-Host ""
    Write-Host " !! SECRETS ($($secrets.Count)) - do not push" -ForegroundColor Red
    $secrets | ForEach-Object { Write-Host ("   [{0}] {1}:{2}`n       {3}" -f $_.Rule, $_.File, $_.Line, $_.Text) }
}
if ($piiHits.Count) {
    Write-Host ""
    Write-Host " PII ($($piiHits.Count)) - review before publishing" -ForegroundColor Yellow
    $piiHits | ForEach-Object { Write-Host ("   [{0}] {1}:{2}`n       {3}" -f $_.Rule, $_.File, $_.Line, $_.Text) }
}

Write-Host ""
Write-Host " If a hit is a documented placeholder, add it to the `$allow list in this script."
Write-Host ""
exit 1
