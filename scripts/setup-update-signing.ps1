[CmdletBinding()]
param([string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'FBForge\signing\connect-updater.key'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'update_signing_windows_required' }
$root = Split-Path -Parent $PSScriptRoot
$full = [IO.Path]::GetFullPath($KeyPath)
if ($full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'update_private_key_must_be_outside_repository' }
if ((Test-Path -LiteralPath $full) -or (Test-Path -LiteralPath ($full + '.pub'))) { throw 'update_key_already_exists' }
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $full) -Force
Push-Location $root
try {
    # The CLI prompts for a password. Never pass private material in a command line or log.
    & npx.cmd tauri signer generate --write-keys $full
    if ($LASTEXITCODE -ne 0) { throw 'update_key_generation_failed' }
    $public = [IO.File]::ReadAllText($full + '.pub').Trim()
    if (-not $public) { throw 'update_public_key_missing' }
    [IO.File]::WriteAllText((Join-Path $root 'desktop/update-public-key.txt'), $public + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output 'Public update key installed. Commit only desktop/update-public-key.txt, then validate the exact commit.'
    Write-Output 'Back up the private key and password securely. Configure TAURI_SIGNING_PRIVATE_KEY_PATH on the signing runner.'
} finally { Pop-Location }
