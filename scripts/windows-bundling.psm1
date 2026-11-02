Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CheckedWindowsBundle {
    param(
        [Parameter(Mandatory)][string]$BinaryPath,
        [Parameter(Mandatory)][scriptblock]$Bundle
    )
    if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) { throw 'bundle_application_missing' }
    $expected = (Get-FileHash -LiteralPath $BinaryPath -Algorithm SHA256).Hash
    & $Bundle
    if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf) -or
        (Get-FileHash -LiteralPath $BinaryPath -Algorithm SHA256).Hash -ne $expected) {
        throw 'bundle_application_changed'
    }
    Write-Output ('Application SHA256 unchanged: ' + $expected.ToLowerInvariant())
}

Export-ModuleMember -Function Invoke-CheckedWindowsBundle
