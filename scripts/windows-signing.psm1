Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-WindowsSignTool {
    $root = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $versions = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending)
    foreach ($version in $versions) {
        $path = Join-Path $version.FullName 'x64\signtool.exe'
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
    throw 'signing_windows_sdk_missing'
}

function Assert-CodeSigningCertificate {
    param([Parameter(Mandatory)]$Certificate, [DateTime]$Now = [DateTime]::UtcNow)
    if (-not $Certificate.HasPrivateKey) { throw 'signing_private_key_unavailable' }
    if ($Certificate.NotBefore.ToUniversalTime() -gt $Now -or $Certificate.NotAfter.ToUniversalTime() -le $Now) { throw 'signing_certificate_not_current' }
    $usage = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
    if ($usage.Count -ne 1 -or @($usage[0].EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }).Count -ne 1) { throw 'signing_certificate_wrong_usage' }
}

function Assert-WindowsSignature {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Thumbprint,
        [Parameter(Mandatory)][string]$SignTool
    )
    $file = [IO.Path]::GetFullPath($Path)
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    Write-Host ('Authenticode: ' + [IO.Path]::GetFileName($file) + ' [' + $signature.Status + ']')
    if ($signature.Status -ne 'Valid') { throw 'signing_signature_invalid' }
    if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $Thumbprint) { throw 'signing_certificate_mismatch' }
    if (-not $signature.TimeStamperCertificate) { throw 'signing_timestamp_missing' }
    & $SignTool verify /pa /all /tw /v $file | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'signing_verification_failed' }
    return [pscustomobject]@{
        file = [IO.Path]::GetFileName($file)
        sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        certificateThumbprint = $signature.SignerCertificate.Thumbprint
        timestampCertificateThumbprint = $signature.TimeStamperCertificate.Thumbprint
        verified = $true
    }
}

function Invoke-WindowsFileSigning {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Thumbprint,
        [Parameter(Mandatory)][string]$TimestampUrl,
        [Parameter(Mandatory)][string]$SignTool,
        [Parameter(Mandatory)][string]$MainBinaryPath,
        [Parameter(Mandatory)][string]$SignedMainBinaryPath
    )
    $file = [IO.Path]::GetFullPath($Path)
    & $SignTool sign /fd SHA256 /sha1 $Thumbprint /d 'FBForge Connect' /tr $TimestampUrl /td SHA256 $file | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'signing_file_failed' }
    $null = Assert-WindowsSignature -Path $file -Thumbprint $Thumbprint -SignTool $SignTool
    if ($file -eq [IO.Path]::GetFullPath($MainBinaryPath)) {
        # Tauri restores the unsigned original after bundling. Save the exact signed
        # bytes now, while NSIS will still read this same executable into the setup.
        Copy-Item -LiteralPath $file -Destination $SignedMainBinaryPath
    }
}

Export-ModuleMember -Function Get-WindowsSignTool, Assert-CodeSigningCertificate, Assert-WindowsSignature, Invoke-WindowsFileSigning
