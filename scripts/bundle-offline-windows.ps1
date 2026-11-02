Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'bundle_windows_required' }
Import-Module (Join-Path $PSScriptRoot 'windows-bundling.psm1') -Force
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    Invoke-CheckedWindowsBundle -BinaryPath 'desktop/target/release/fbforge-connect.exe' -Bundle {
        # The online artifact was retained before this step. Remove stale setup files.
        $bundle = 'desktop/target/release/bundle/nsis'
        if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Recurse -Force }
        & npm.cmd run desktop:bundle:offline
        if ($LASTEXITCODE -ne 0) { throw 'offline_bundle_failed' }
    }
} finally {
    Pop-Location
}
