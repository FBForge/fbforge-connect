Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
foreach ($name in @('scripts/windows-signing.psm1','scripts/sign-windows-file.ps1','scripts/build-signed-windows.ps1','scripts/ci/check-signed-package.ps1','scripts/windows-install-smoke.ps1')) {
    $tokens = $null
    $errors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $root $name), [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ('signing_script_parse_failed: ' + $name + ': ' + $errors[0].Message) }
}
Import-Module (Join-Path $root 'scripts/windows-signing.psm1') -Force
function Expect-Rejection([scriptblock]$Action, [string]$Code) {
    try { & $Action } catch {
        if ($_.Exception.Message -ne $Code) { throw }
        return
    }
    throw ('expected_rejection_missing: ' + $Code)
}
$now = [DateTime]::UtcNow
function New-TestCertificate {
    [pscustomobject]@{
        HasPrivateKey = $true
        NotBefore = $now.AddDays(-1)
        NotAfter = $now.AddDays(1)
        Extensions = @([pscustomobject]@{ Oid = [pscustomobject]@{ Value = '2.5.29.37' }; EnhancedKeyUsages = @([pscustomobject]@{ Value = '1.3.6.1.5.5.7.3.3' }) })
    }
}
Assert-CodeSigningCertificate (New-TestCertificate) -Now $now
$certificate = New-TestCertificate
$certificate.HasPrivateKey = $false
Expect-Rejection { Assert-CodeSigningCertificate $certificate -Now $now } 'signing_private_key_unavailable'
$certificate = New-TestCertificate
$certificate.NotAfter = $now
Expect-Rejection { Assert-CodeSigningCertificate $certificate -Now $now } 'signing_certificate_not_current'
$certificate = New-TestCertificate
$certificate.NotBefore = $now.AddMinutes(1)
Expect-Rejection { Assert-CodeSigningCertificate $certificate -Now $now } 'signing_certificate_not_current'
$certificate = New-TestCertificate
$certificate.Extensions = @()
Expect-Rejection { Assert-CodeSigningCertificate $certificate -Now $now } 'signing_certificate_wrong_usage'
$certificate = New-TestCertificate
$certificate.Extensions[0].EnhancedKeyUsages[0].Value = '1.3.6.1.5.5.7.3.1'
Expect-Rejection { Assert-CodeSigningCertificate $certificate -Now $now } 'signing_certificate_wrong_usage'

# Replace only the OS signature lookup. Exercise the verifier's real decision and exit-code paths.
$module = Get-Module windows-signing
$temporary = Join-Path $env:RUNNER_TEMP ('signing-contracts-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporary
$file = Join-Path $temporary 'fictional.exe'
$tool = Join-Path $temporary 'verify.cmd'
[IO.File]::WriteAllText($file, 'fictional bytes')
[IO.File]::WriteAllText($tool, "@echo off`r`nexit /b 0`r`n")
$thumbprint = 'a' * 40
try {
    & $module {
        $script:testSignature = $null
        function script:Get-AuthenticodeSignature { param([string]$LiteralPath) return $script:testSignature }
    }
    $signature = [pscustomobject]@{ Status = 'Valid'; SignerCertificate = [pscustomobject]@{ Thumbprint = $thumbprint }; TimeStamperCertificate = [pscustomobject]@{ Thumbprint = ('b' * 40) } }
    & $module { param($Value) $script:testSignature = $Value } $signature
    $verified = Assert-WindowsSignature -Path $file -Thumbprint $thumbprint -SignTool $tool
    if (-not $verified.verified -or $verified.sha256 -ne (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'signing_hash_contract_failed' }
    $snapshot = Join-Path $temporary 'packaged-application.exe'
    Invoke-WindowsFileSigning -Path $file -Thumbprint $thumbprint -TimestampUrl 'https://timestamp.example.invalid' -SignTool $tool -MainBinaryPath $file -SignedMainBinaryPath $snapshot
    [IO.File]::WriteAllText($file, 'restored unsigned original')
    if ([IO.File]::ReadAllText($snapshot) -ne 'fictional bytes') { throw 'signing_packaged_snapshot_changed' }
    $plugin = Join-Path $temporary 'plugin.dll'
    [IO.File]::WriteAllText($plugin, 'fictional plugin')
    Invoke-WindowsFileSigning -Path $plugin -Thumbprint $thumbprint -TimestampUrl 'https://timestamp.example.invalid' -SignTool $tool -MainBinaryPath $file -SignedMainBinaryPath $snapshot
    if ([IO.File]::ReadAllText($snapshot) -ne 'fictional bytes') { throw 'signing_plugin_replaced_application' }
    $signature.Status = 'NotSigned'
    Expect-Rejection { Assert-WindowsSignature -Path $file -Thumbprint $thumbprint -SignTool $tool } 'signing_signature_invalid'
    $signature.Status = 'Valid'
    $signature.SignerCertificate.Thumbprint = 'c' * 40
    Expect-Rejection { Assert-WindowsSignature -Path $file -Thumbprint $thumbprint -SignTool $tool } 'signing_certificate_mismatch'
    $signature.SignerCertificate.Thumbprint = $thumbprint
    $signature.TimeStamperCertificate = $null
    Expect-Rejection { Assert-WindowsSignature -Path $file -Thumbprint $thumbprint -SignTool $tool } 'signing_timestamp_missing'
    $signature.TimeStamperCertificate = [pscustomobject]@{ Thumbprint = ('b' * 40) }
    [IO.File]::WriteAllText($tool, "@echo off`r`nexit /b 1`r`n")
    Expect-Rejection { Assert-WindowsSignature -Path $file -Thumbprint $thumbprint -SignTool $tool } 'signing_verification_failed'
    Remove-Item -LiteralPath $snapshot
    Expect-Rejection { Invoke-WindowsFileSigning -Path $file -Thumbprint $thumbprint -TimestampUrl 'https://timestamp.example.invalid' -SignTool $tool -MainBinaryPath $file -SignedMainBinaryPath $snapshot } 'signing_file_failed'
    if (Test-Path -LiteralPath $snapshot) { throw 'signing_failed_file_captured' }
} finally {
    Remove-Module windows-signing
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
Write-Output 'Signing scripts parse. Missing keys, invalid usage/dates, unsigned files, wrong signer, missing timestamp and failed platform verification are rejected.'
# The final negative case deliberately leaves the native verifier exit code at 1.
exit 0
