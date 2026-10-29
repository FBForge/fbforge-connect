[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Thumbprint,
    [Parameter(Mandatory)][string]$TimestampUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::UserInteractive) { throw 'signing_interactive_windows_required' }
if ($env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or $env:GITHUB_REPOSITORY -ne 'FBForge/fbforge-connect' -or $env:GITHUB_REF -ne 'refs/heads/main') { throw 'signing_context_denied' }
if ($env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$' -or $env:VALIDATION_RUN -notmatch '^[1-9][0-9]{0,18}$') { throw 'signing_provenance_missing' }
$uri = $null
if (-not [Uri]::TryCreate($TimestampUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('https','http') -or -not $uri.Host -or $uri.UserInfo -or $uri.Fragment) { throw 'signing_timestamp_url_invalid' }
Import-Module (Join-Path $PSScriptRoot 'windows-signing.psm1') -Force
$signTool = Get-WindowsSignTool
$certificate = Get-Item -LiteralPath ('Cert:\CurrentUser\My\' + $Thumbprint)
Assert-CodeSigningCertificate $certificate
$root = Split-Path -Parent $PSScriptRoot
$publicKey = Join-Path $root 'desktop/update-public-key.txt'
$updateKeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
if (-not $updateKeyPath) { $updateKeyPath = Join-Path $env:LOCALAPPDATA 'FBForge\signing\connect-updater.key' }
if (-not (Test-Path -LiteralPath $updateKeyPath -PathType Leaf) -or -not ([IO.File]::ReadAllText($publicKey).Trim()) -or -not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { throw 'update_signing_setup_required' }
$temporary = Join-Path $env:RUNNER_TEMP ('fbforge-signing-' + [Guid]::NewGuid().ToString('N') + '.json')
$output = Join-Path $env:RUNNER_TEMP ('fbforge-signed-' + [Guid]::NewGuid().ToString('N'))
$binary = Join-Path $output 'fbforge-connect.exe'
$signer = Join-Path $PSScriptRoot 'sign-windows-file.ps1'
$config = @{ bundle = @{ windows = @{ certificateThumbprint = $Thumbprint; digestAlgorithm = 'sha256'; timestampUrl = $TimestampUrl; tsp = $true; signCommand = @{ cmd = 'powershell.exe'; args = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$signer,'-Thumbprint',$Thumbprint,'-TimestampUrl',$TimestampUrl,'-SignedMainBinaryPath',$binary,'-Path','%1') } } } }
[IO.File]::WriteAllText($temporary, ($config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Push-Location $root
try {
    $head = & git rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head -ne $env:GITHUB_SHA) { throw 'signing_checkout_mismatch' }
    $dirty = & git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'signing_checkout_modified' }
    $bundle = Join-Path $root 'desktop\target\release\bundle\nsis'
    if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Recurse -Force }
    $null = New-Item -ItemType Directory -Path $output
    & npm.cmd run desktop:build -- --config $temporary -- --locked
    if ($LASTEXITCODE -ne 0) { throw 'signing_build_failed' }
    $dirty = & git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'signing_source_changed_during_build' }
    $setup = @(Get-ChildItem -LiteralPath $bundle -Filter '*-setup.exe' -File)
    if ($setup.Count -ne 1) { throw 'signing_installer_ambiguous' }
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'signing_application_snapshot_missing' }
    $signatures = @(
        (Assert-WindowsSignature -Path $binary -Thumbprint $Thumbprint -SignTool $signTool),
        (Assert-WindowsSignature -Path $setup[0].FullName -Thumbprint $Thumbprint -SignTool $signTool)
    )
    Copy-Item -LiteralPath $setup[0].FullName -Destination $output
    $version = (Get-Content -LiteralPath 'desktop/tauri.conf.json' -Raw | ConvertFrom-Json).version
    $manifest = [ordered]@{ application = 'FBForge Connect'; version = $version; repository = $env:GITHUB_REPOSITORY; commit = $head; runId = $env:GITHUB_RUN_ID; validationRunId = $env:VALIDATION_RUN; platform = 'windows-x64'; signing = 'authenticode'; certificateThumbprint = $Thumbprint.ToUpperInvariant(); installer = $setup[0].Name; bytes = $setup[0].Length; sha256 = $signatures[1].sha256 }
    [IO.File]::WriteAllText((Join-Path $output 'build-info.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'), ($manifest.sha256 + '  ' + $manifest.installer + "`n"), [Text.UTF8Encoding]::new($false))
    # Sign the final Authenticode-signed bytes; do not re-sign or modify setup afterwards.
    & npx.cmd tauri signer sign --private-key-path $updateKeyPath --app-version $version $setup[0].FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'update_signature_failed' }
    Copy-Item -LiteralPath ($setup[0].FullName + '.sig') -Destination $output
    & python.exe (Join-Path $PSScriptRoot 'update-release.py') $output --public-key $publicKey
    if ($LASTEXITCODE -ne 0) { throw 'update_manifest_failed' }
    Add-Content -LiteralPath $env:GITHUB_ENV -Value ('SIGNED_OUTPUT=' + $output)
    Write-Output 'Signed application and installer verified. No release was published.'
} finally {
    Pop-Location
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
}
