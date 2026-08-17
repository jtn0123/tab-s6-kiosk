# Secret / PII scanner for this repo.
# Self-contained - no install required. Run before pushing, or wire it as a pre-commit hook.
#
#   powershell -File scripts/scan-secrets.ps1              # scan tracked files (worktree content)
#   powershell -File scripts/scan-secrets.ps1 -All         # scan everything on disk, tracked or not
#   powershell -File scripts/scan-secrets.ps1 -Staged      # scan the INDEX (hook mode)
#
# Exit code 0 = clean, 1 = findings.
#
# --- what this repo is actually protecting ----------------------------------
# The headline risk here is not an API key. It is the owner's HOME COORDINATES, which live in
# assets/config.js, in a PUBLIC repo. That file is tracked with --skip-worktree so the real
# values never stage; the coordinate rules below are the second line of defence for the day
# somebody clears that bit, copies the file, or pastes a lat/long into a README.
#
# Two properties this script must keep:
#   1. -Staged reads content from the INDEX (git show :path), not from the worktree. Listing
#      staged paths and then reading whatever happens to be on disk means a file that is
#      staged-dirty and clean-on-disk sails through the hook - the exact hole a `git add`
#      followed by an edit opens.
#   2. It fails CLOSED. Anything it cannot read is a finding, not a skip.

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
# `scope` (optional) restricts a rule to files whose repo-relative path matches it. Used for
# the rules that would be pure noise everywhere else - `name:` is a YAML keyword, a
# package.json field and a widget property, but inside config.js it is a place the owner
# lives.
$pii = @(
    @{ name='Email address';         re='[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.(com|net|org|io|dev|co)\b' },
    @{ name='Private LAN IP';        re='\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b' },
    @{ name='Android device serial'; re='\bR5[0-9A-Z]{9}\b' },
    @{ name='Local user path';       re='(?i)C:\\Users\\(?!<)[A-Za-z0-9._\-]+\\' },
    @{ name='Wi-Fi PSK-ish';         re='(?i)\b(psk|wpa|wifi[_\-]?pass)\b\s*[=:]\s*\S{8,}' },

    # ---- the ones that exist for THIS repo -------------------------------------------
    # A latitude/longitude assignment carrying 3+ decimals. 3 decimals is ~110 m: precise
    # enough to be a house, and coarse enough that "lat: 47.6" style rounding is ignored.
    # Covers latitude/longitude/lat/lon/lng, JS or JSON, quoted or bare.
    @{ name='Geo coordinate';        re='(?i)\b(latitude|longitude|\blat|\blon|\blng)\b["'']?\s*[=:]\s*["'']?[-+]?\d{1,3}\.\d{3,}' },
    # A bare "47.6062, -122.3321" pair anywhere in prose, a URL or a commit message - the
    # form that never looks like a secret and gets pasted into a README.
    @{ name='Geo coordinate pair';   re='[-+]?\b\d{1,2}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,}\b' },
    # Open-Meteo (and anything else) called with real coordinates in the query string.
    @{ name='Geo in URL';            re='(?i)[?&](lat|latitude|lon|lng|longitude)=[-+]?\d{1,3}\.\d{3,}' },
    # The human-readable half of the same leak: config.js's location.name is where the owner
    # writes the town they live in. Scoped to config files so `name:` elsewhere is ignored.
    # Not anchored to line start: a one-line `{ name: "Oak Park", latitude: ... }` config is
    # exactly the shape somebody flattens it to, and an anchored rule left the town name
    # sitting in the scanner's own (public) report as context around the redacted coordinates.
    # config.js uses `label:` for Home Assistant entities, so `name:` here really is only the
    # location block.
    @{ name='Place name in config';  re='(?i)["'']?\bname["'']?\s*[=:]\s*["''][^"'']{2,}["'']';
       scope='(?i)(^|[\\/])config[^\\/]*\.js$' }
)

# allowlist - documented placeholders and public examples, not real secrets.
# A line matching any of these is exempt from every rule, so keep each entry tight enough
# that it cannot double as cover for a real value.
$allow = @(
    'example\.com', 'user@example', 'placeholder', '<tablet-ip>', '<nas-ip>', '<SERIAL>',
    'noreply@', '10\.0\.0\.', '192\.168\.1\.1\b',
    'jtn0123@users\.noreply\.github\.com',

    # The committed Seattle placeholder, in every form it appears in (config.js, README).
    # Pinned to the exact digits and anchored with \b so 47.60621 is NOT covered: an
    # allowlist that swallowed any nearby coordinate would defeat the rule it exempts.
    '(?i)\blatitude\b\s*[=:]\s*47\.6062\b',
    '(?i)\blongitude\b\s*[=:]\s*-122\.3321\b',
    '\b47\.6062\s*,\s*-122\.3321\b',
    # ...and the placeholder place names those coordinates ship with.
    '(?i)["'']?\bname["'']?\s*[=:]\s*["''](Seattle|Kitchen|Test Location|Living Room|Wall Panel)["'']'
)

# Severity is carried on the rule rather than derived by `$rules -contains $r` at match time:
# that comparison was reference equality over hashtables and would silently mislabel every
# finding the moment a rule got copied instead of referenced.
$allRules = @()
foreach ($r in $rules) { $allRules += ($r + @{ sev = 'SECRET' }) }
foreach ($r in $pii)   { $allRules += ($r + @{ sev = 'PII' }) }

# --- pick the file list -----------------------------------------------------
Push-Location $repo
if ($Staged) {
    # -z + NUL split: `git diff --cached --name-only` quotes and escapes paths containing
    # non-ASCII or spaces, and a quoted path does not resolve.
    $files = @((& git diff --cached --name-only --diff-filter=ACM -z 2>$null) -join "`0" -split "`0" |
        Where-Object { $_ })
} elseif ($All) {
    $files = @(Get-ChildItem $repo -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.git\\' } |
        ForEach-Object { $_.FullName.Substring($repo.Length + 1) })
} else {
    $files = @(git ls-files 2>$null)
}

# skip binaries and things we never want to read
$skipExt = @('.png','.jpg','.jpeg','.gif','.apk','.idsig','.keystore','.zip','.7z','.tar','.img','.bin','.jar','.dex','.ico','.pdf','.woff','.woff2')

$findings = @()
$scanned = 0
$unreadable = @()

# In -Staged mode the content that matters is the INDEX, not the worktree. Reading from disk
# there was a real hole: `git add secrets.js` then `echo clean > secrets.js` staged the secret
# and showed the hook something innocent. `git show :<path>` is the staged blob itself.
function Get-ScanLines {
    param([string]$rel)

    if ($Staged) {
        $size = (& git cat-file -s ":$rel" 2>$null)
        if ($LASTEXITCODE -ne 0) { return $null }          # unreadable -> caller treats as a finding
        if ([int64]$size -gt 2MB) { return @() }
        $blob = @(& git show ":$rel" 2>$null)
        if ($LASTEXITCODE -ne 0) { return $null }
        return $blob
    }

    $full = Join-Path $repo $rel
    if (-not (Test-Path $full -PathType Leaf)) { return @() }
    if ((Get-Item $full).Length -gt 2MB) { return @() }
    return @(Get-Content $full -ErrorAction SilentlyContinue)
}

foreach ($rel in $files) {
    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
    if ($skipExt -contains ([IO.Path]::GetExtension($rel).ToLower())) { continue }

    $lines = Get-ScanLines -rel $rel
    if ($null -eq $lines) { $unreadable += $rel; continue }
    if ($lines.Count -eq 0) { continue }

    $scanned++
    $lineNo = 0
    foreach ($line in $lines) {
        $lineNo++
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $allowed = $false
        foreach ($a in $allow) { if ($line -match $a) { $allowed = $true; break } }
        if ($allowed) { continue }

        foreach ($r in $allRules) {
            if ($r.scope -and ($rel -notmatch $r.scope)) { continue }
            if ($line -match $r.re) {
                # Redact the matched span. This report is printed by a GitHub Actions job on a
                # PUBLIC repo, so echoing the offending value would publish the very thing the
                # scanner exists to keep unpublished. File and line are enough to go and fix it.
                $snip = ($line -replace $r.re, '<redacted>').Trim()
                if ($snip.Length -gt 90) { $snip = $snip.Substring(0,90) + '...' }
                $findings += [pscustomobject]@{
                    Severity = $r.sev; Rule = $r.name; File = $rel; Line = $lineNo; Text = $snip
                }
            }
        }
    }
}
Pop-Location

Write-Host ""
Write-Host ("=" * 74)
Write-Host " Secret / PII scan - $scanned files scanned$(if ($Staged) { ' (from the git index)' })"
Write-Host ("=" * 74)

# Fail closed. A file we were asked to scan and could not read is not "clean".
if ($unreadable.Count) {
    Write-Host ""
    Write-Host " !! UNREADABLE ($($unreadable.Count)) - refusing to report clean" -ForegroundColor Red
    $unreadable | ForEach-Object { Write-Host "   $_" }
    Write-Host ""
    exit 1
}

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
Write-Host " Values are redacted above - open the file at the reported line to see the hit."
Write-Host " If it is a documented placeholder, add it to the `$allow list in this script."
Write-Host ""
exit 1
