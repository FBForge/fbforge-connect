Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '../windows-bundling.psm1') -Force
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('bundle-contracts-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporary
$file = Join-Path $temporary 'fictional.exe'
function Expect-Rejection([scriptblock]$Action, [string]$Code) {
    try { & $Action } catch {
        if ($_.Exception.Message -ne $Code) { throw }
        return
    }
    throw ('expected_rejection_missing: ' + $Code)
}
try {
    $script:called = $false
    Expect-Rejection { Invoke-CheckedWindowsBundle -BinaryPath $file -Bundle { $script:called = $true } } 'bundle_application_missing'
    if ($script:called) { throw 'bundle_ran_without_application' }
    [IO.File]::WriteAllText($file, 'same compiled application')
    Invoke-CheckedWindowsBundle -BinaryPath $file -Bundle { $script:called = $true }
    if (-not $script:called) { throw 'bundle_not_called' }
    Expect-Rejection { Invoke-CheckedWindowsBundle -BinaryPath $file -Bundle { throw 'fictional_bundle_failed' } } 'fictional_bundle_failed'
    Expect-Rejection { Invoke-CheckedWindowsBundle -BinaryPath $file -Bundle { [IO.File]::WriteAllText($file, 'changed application') } } 'bundle_application_changed'
    Expect-Rejection { Invoke-CheckedWindowsBundle -BinaryPath $file -Bundle { Remove-Item -LiteralPath $file } } 'bundle_application_changed'
    Write-Output 'Bundle contract passed: missing, failed, changed and removed application rejected.'
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
