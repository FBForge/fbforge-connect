[CmdletBinding()]
param([string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'FBForge\signing\connect-updater.key'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'update_signing_windows_required' }
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$full = [IO.Path]::GetFullPath($KeyPath)
if ($full.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'update_private_key_must_be_outside_repository'
}
if ($full.StartsWith('\\', [StringComparison]::Ordinal)) { throw 'update_private_key_requires_local_windows_path' }
if ((Test-Path -LiteralPath $full) -or (Test-Path -LiteralPath ($full + '.pub'))) { throw 'update_key_already_exists' }
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$cliVersion = $package.devDependencies.'@tauri-apps/cli'
if ($cliVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'update_signer_version_must_be_pinned' }
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $full) -Force
# CMD cannot start npm's .cmd shim with a UNC working directory. Resolve the pinned Windows CLI
# through npm's cache from a local temporary directory, independent of WSL's Linux node_modules.
$working = Join-Path ([IO.Path]::GetTempPath()) ('fbforge-update-signer-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $working
try {
    Push-Location $working
    try {
        # The CLI prompts for a password; never pass private material in arguments or logs.
        & npx.cmd --yes --package "@tauri-apps/cli@$cliVersion" tauri signer generate --write-keys $full
        if ($LASTEXITCODE -ne 0) { throw 'update_key_generation_failed' }
    } finally { Pop-Location }
    $public = [IO.File]::ReadAllText($full + '.pub').Trim()
    if (-not $public) { throw 'update_public_key_missing' }
    [IO.File]::WriteAllText((Join-Path $root 'desktop/update-public-key.txt'), $public + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output 'Public update key installed. Commit only desktop/update-public-key.txt, then validate the exact commit.'
    Write-Output 'Back up the private key and password securely. Configure TAURI_SIGNING_PRIVATE_KEY_PATH on the signing runner.'
} finally { Remove-Item -LiteralPath $working -Recurse -Force }
