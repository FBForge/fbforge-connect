[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][string]$Baseline,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Thumbprint
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $Directory 'build-info.json') -Raw | ConvertFrom-Json
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../desktop/tauri.conf.json') -Raw | ConvertFrom-Json).version
if ($manifest.commit -ne $env:GITHUB_SHA -or $manifest.runId -ne $env:GITHUB_RUN_ID -or $manifest.validationRunId -ne $env:VALIDATION_RUN -or $manifest.version -ne $version -or $manifest.repository -ne $env:GITHUB_REPOSITORY -or $manifest.signing -ne 'authenticode' -or $manifest.certificateThumbprint -ne $Thumbprint) { throw 'signed_manifest_context_mismatch' }
if ([IO.Path]::GetFileName($manifest.installer) -ne $manifest.installer -or $manifest.installer -notlike '*-setup.exe') { throw 'signed_installer_name_invalid' }
$setup = Join-Path $Directory $manifest.installer
$file = Get-Item -LiteralPath $setup
$hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $manifest.sha256 -or $file.Length -ne $manifest.bytes) { throw 'signed_installer_integrity_failed' }
$checksums = [IO.File]::ReadAllText((Join-Path $Directory 'SHA256SUMS.txt')).Trim()
if ($checksums -ne ($hash + '  ' + $manifest.installer)) { throw 'signed_checksum_manifest_mismatch' }
Import-Module (Join-Path $PSScriptRoot '../windows-signing.psm1') -Force
$tool = Get-WindowsSignTool
$binary = Join-Path $Directory 'fbforge-connect.exe'
$null = Assert-WindowsSignature -Path $setup -Thumbprint $Thumbprint -SignTool $tool
$null = Assert-WindowsSignature -Path $binary -Thumbprint $Thumbprint -SignTool $tool
$previous = @(Get-ChildItem -LiteralPath $Baseline -Filter '*-setup.exe' -File)
if ($previous.Count -ne 1) { throw 'signed_upgrade_baseline_ambiguous' }
$previousManifest = Get-Content -LiteralPath (Join-Path $Baseline 'build-info.json') -Raw | ConvertFrom-Json
if ($previousManifest.commit -ne $env:GITHUB_SHA -or $previousManifest.runId -ne $env:VALIDATION_RUN -or $previousManifest.version -ne $version -or $previousManifest.installer -ne $previous[0].Name -or $previousManifest.signing -ne 'unsigned' -or $previousManifest.sha256 -ne (Get-FileHash -LiteralPath $previous[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'signed_upgrade_baseline_mismatch' }
$bridge = Join-Path $PSScriptRoot '../../desktop/native-contracts/target/debug/examples/profile-checkpoint.exe'
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '../windows-install-smoke.ps1') -InstallerPath $setup -ExpectedBinaryPath $binary -CheckpointBridge $bridge -PreviousInstallerPath $previous[0].FullName -ExpectedSignerThumbprint $Thumbprint -SignatureReportPath (Join-Path $Directory 'signature-info.json')
if ($LASTEXITCODE -ne 0) { throw 'signed_installer_validation_failed' }
