[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][string]$CheckpointBridge,
    [Parameter(Mandatory)][string]$ExpectedBinaryPath,
    [string]$PreviousInstallerPath = '',
    [ValidateSet('fbforge-connect.exe', 'fit-connect-integration-client.exe')][string]$PreviousBinaryName = 'fbforge-connect.exe',
    [string]$RecentInstallerPath = '',
    [ValidatePattern('^$|^[a-fA-F0-9]{40}$')][string]$ExpectedSignerThumbprint = '',
    [string]$SignatureReportPath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($SignatureReportPath -and -not $ExpectedSignerThumbprint) { throw 'installer_signature_context_missing' }
$taskSignatures = @{}
if ($ExpectedSignerThumbprint) {
    Import-Module (Join-Path $PSScriptRoot 'windows-signing.psm1') -Force
    $taskSignTool = Get-WindowsSignTool
    $taskSignatures['setup'] = Assert-WindowsSignature -Path $InstallerPath -Thumbprint $ExpectedSignerThumbprint -SignTool $taskSignTool
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InstallerWindowFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
}
'@
$taskRoot = Join-Path $env:RUNNER_TEMP ('fbforge-install-' + [Guid]::NewGuid().ToString('N'))
$taskInstall = Join-Path $taskRoot 'application files'
$taskProfiles = Join-Path $env:APPDATA 'org.fitconnect.integration-client\profiles'
$taskProfileId = [Guid]::NewGuid().ToString()
$taskProfileFile = Join-Path $taskProfiles ($taskProfileId + '.profile')
$taskApp = $null
$taskJavaIds = @()
$taskScannerPid = $null
$taskOwnsProfiles = $false
$taskScannerRoot = Join-Path $env:LOCALAPPDATA 'org.fitconnect.integration-client\scanner'
$taskOwnsScanner = $false
$taskBinaryName = 'fbforge-connect.exe'
$taskLegacyShortcuts = [Collections.Generic.List[string]]::new()

function Wait-Condition([scriptblock]$Check, [string]$Failure, [int]$Seconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $value = & $Check
        if ($value) { return $value }
        Start-Sleep -Milliseconds 400
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $Failure
}
function Install-Owned([string]$Setup, [string]$BinaryName = $taskBinaryName, [string]$Scanner = '') {
    if (-not (Test-Path -LiteralPath $Setup -PathType Leaf)) { throw 'installer_missing' }
    # NSIS requires /D last; the remaining command line is the destination, including spaces.
    $install = Start-Process -FilePath $Setup -ArgumentList ('/S ' + $(if ($Scanner) { '/SCANNER=' + $Scanner + ' ' } else { '' }) + '/D=' + $taskInstall) -PassThru
    if (-not $install.WaitForExit(120000)) { $install.Kill(); throw 'installer_timeout' }
    if ($install.ExitCode -ne 0) { throw 'installer_failed' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskInstall $BinaryName))) { throw 'installed_binary_missing' }
}
function Shortcut-Folders {
    @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
}
function Seed-LegacyShortcuts {
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($folder in @(Shortcut-Folders)) {
            $path = Join-Path $folder 'FIT-Connect Test-Client.lnk'
            if (Test-Path -LiteralPath $path) { throw 'legacy_shortcut_fixture_conflict' }
            $shortcut = $shell.CreateShortcut($path)
            $shortcut.TargetPath = Join-Path $taskInstall 'fit-connect-integration-client.exe'
            $shortcut.Save()
            $taskLegacyShortcuts.Add($path)
            $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
        }
    } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
function Check-Shortcuts {
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($folder in @(Shortcut-Folders)) {
            $path = Join-Path $folder 'FBForge Connect.lnk'
            if (-not (Test-Path -LiteralPath $path)) { throw 'installed_shortcut_missing' }
            $shortcut = $shell.CreateShortcut($path)
            try {
                if ($shortcut.TargetPath -ne (Join-Path $taskInstall $taskBinaryName)) { throw 'installed_shortcut_target_mismatch' }
            } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) }
        }
        foreach ($path in $taskLegacyShortcuts) {
            if (Test-Path -LiteralPath $path) { throw 'legacy_shortcut_not_removed' }
        }
    } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
function Stop-OwnedApp {
    if ($script:taskApp) {
        if (-not $script:taskApp.HasExited) {
            $script:taskJavaIds = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $script:taskApp.Id + " AND Name = 'java.exe'") | ForEach-Object { [int]$_.ProcessId })
            $null = $script:taskApp.CloseMainWindow()
            if (-not $script:taskApp.WaitForExit(15000)) { $script:taskApp.Kill(); $script:taskApp.WaitForExit() }
        }
        foreach ($childId in $script:taskJavaIds) { Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue }
        if ($script:taskScannerPid) {
            $null = Wait-Condition { -not (Get-Process -Id $script:taskScannerPid -ErrorAction SilentlyContinue) } 'scanner_orphan_after_app_exit' 10
            $script:taskScannerPid = $null
        }
        $script:taskApp.Dispose(); $script:taskApp = $null; $script:taskJavaIds = @()
    }
}
function Find-Named($Root, [string]$Name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    return $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Find-Button($Root, [string]$Name) {
    $nameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    $typeCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $condition = [System.Windows.Automation.AndCondition]::new($nameCondition, $typeCondition)
    $element = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if ($element -and $element.Current.IsEnabled) { return $element }
    return $null
}
function Invoke-Named($Root, [string]$Name) {
    $element = Wait-Condition { Find-Button $Root $Name } ('installer_ui_control_missing: ' + $Name)
    $pattern = $null
    if (-not $element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { throw 'installer_ui_invoke_unavailable' }
    $element.SetFocus()
    $pattern.Invoke()
}
function Open-Diagnostics($Root) {
    # UIA Invoke is asynchronous and can be lost while a new WebView activates.
    # Reconcile only this idempotent navigation; never retry a network write.
    $navigation = @{ next = [DateTime]::MinValue }
    $null = Wait-Condition {
        $probe = Find-Button $Root 'Komponenten prüfen'
        if ($probe -and -not $probe.Current.IsOffscreen) { return $true }
        if ([DateTime]::UtcNow -ge $navigation.next) {
            $button = Find-Button $Root 'Diagnose'
            if ($button) {
                Invoke-Named $Root 'Diagnose'
                $navigation.next = [DateTime]::UtcNow.AddSeconds(2)
            }
        }
        return $false
    } 'installer_diagnostics_navigation_failed'
}
function Check-Installed([bool]$ExpectProfile) {
    Write-Output ('Checking installed desktop; synthetic saved profile expected: ' + $ExpectProfile)
    $installedBinary = Join-Path $taskInstall $taskBinaryName
    if (Test-Path -LiteralPath (Join-Path $taskInstall 'fit-connect-integration-client.exe')) { throw 'legacy_binary_not_removed' }
    Check-Shortcuts
    if ((Get-FileHash -LiteralPath $installedBinary -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $ExpectedBinaryPath -Algorithm SHA256).Hash) { throw 'installed_binary_revision_mismatch' }
    if ($ExpectedSignerThumbprint) {
        $script:taskSignatures['application'] = Assert-WindowsSignature -Path $installedBinary -Thumbprint $ExpectedSignerThumbprint -SignTool $taskSignTool
        $script:taskSignatures['uninstaller'] = Assert-WindowsSignature -Path (Join-Path $taskInstall 'uninstall.exe') -Thumbprint $ExpectedSignerThumbprint -SignTool $taskSignTool
    }
    $registration = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FIT-Connect Test-Client'
    if ($registration.DisplayName -ne 'FBForge Connect' -or $registration.Publisher -ne 'FBForge' -or $registration.MainBinaryName -ne $taskBinaryName -or $registration.InstallLocation.Trim('"') -ne $taskInstall) { throw 'installed_upgrade_identity_mismatch' }
    if (Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FBForge Connect') { throw 'duplicate_upgrade_registration' }
    $info = [System.Diagnostics.ProcessStartInfo]::new($installedBinary)
    $info.UseShellExecute = $false; $info.WorkingDirectory = $taskInstall
    # Prove that the application uses its own JDK; do not inherit CI credentials or JVM injection options.
    foreach ($key in @('JAVA_HOME','JDK_HOME','JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH','GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','SENDERID','SENDERSECRET','SENDERDEST','SUBSCRIBERID','SUBSCRIBERSECRET')) { $null = $info.EnvironmentVariables.Remove($key) }
    $info.EnvironmentVariables['PATH'] = "$env:SystemRoot\System32;$env:SystemRoot"
    $script:taskApp = [System.Diagnostics.Process]::Start($info)
    try {
        $window = Wait-Condition {
            if ($script:taskApp.HasExited) { throw 'installed_app_exited' }
            $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $script:taskApp.Id)
            [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
        } 'installed_window_missing'
        if ($window.Current.Name -ne 'FBForge Connect · FIT-Connect TEST') { throw 'installed_title_invalid' }
        # WebView accessibility can remain inactive after silent installer/uninstaller windows.
        # Activate the actual native window, rather than relying on a DOM/UIA focus assignment.
        $handle = [IntPtr]$window.Current.NativeWindowHandle
        $null = [InstallerWindowFocus]::ShowWindow($handle, 9)
        $null = [InstallerWindowFocus]::SetForegroundWindow($handle)
        $null = Wait-Condition { [InstallerWindowFocus]::GetForegroundWindow() -eq $handle } 'installed_window_not_foreground' 15
        Open-Diagnostics $window
        Invoke-Named $window 'Komponenten prüfen'
        $null = Wait-Condition {
            $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Lokal bereit')
            $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition).Count -ge 2
        } 'installed_sdk_probe_failed'
        $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $script:taskApp.Id + " AND Name = 'java.exe'"))
        if ($children.Count -ne 1) { throw 'installed_java_child_missing' }
        $script:taskJavaIds = @($children | ForEach-Object { [int]$_.ProcessId })
        $javaPath = [IO.Path]::GetFullPath($children[0].ExecutablePath)
        if (-not $javaPath.StartsWith($taskInstall + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $javaPath.EndsWith('\runtime\bin\java.exe', [StringComparison]::OrdinalIgnoreCase)) { throw 'external_java_runtime_used' }
        if ($ExpectProfile) {
            # This profile contains only fake credentials and no private keys; no OAuth call is made.
            Invoke-Named $window 'Verbinden'
            $null = Wait-Condition { Find-Named $window 'CI TEST Profil' } 'installed_profile_not_restored'
        }
        if (Test-Path -LiteralPath (Join-Path $taskInstall 'resources/scanner/component.zip')) {
            Invoke-Named $window 'Testwerkzeuge'
            $null = Wait-Condition { Find-Named $window 'Scanner läuft lokal' } 'installed_scanner_not_ready' 90
            $clam = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $script:taskApp.Id + " AND Name = 'clamd.exe'"))
            if ($clam.Count -ne 1 -or -not $clam[0].ExecutablePath.StartsWith($taskScannerRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'installed_scanner_ownership_invalid' }
            $script:taskScannerPid = [int]$clam[0].ProcessId
        }
        Write-Output 'Installed desktop application loaded both SDKs using its bundled JDK with Java/Node absent from PATH'
    } finally { Stop-OwnedApp }
}
function Uninstall-Owned {
    $uninstaller = @(Get-ChildItem -LiteralPath $taskInstall -File -Filter '*uninstall*.exe')
    if ($uninstaller.Count -ne 1) { throw 'uninstaller_missing' }
    $run = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList ('/S _?=' + $taskInstall) -PassThru
    if (-not $run.WaitForExit(120000)) { $run.Kill(); throw 'uninstaller_timeout' }
    if ($run.ExitCode -ne 0) { throw 'uninstaller_failed' }
    $run.Dispose()
}
function Save-SyntheticProfile {
    if (Test-Path -LiteralPath $taskProfiles) { throw 'profile_fixture_conflict' }
    $script:taskOwnsProfiles = $true
    # The CI-only Rust bridge constructs the fixture with product types and validates it.
    # No shell serialization, stdin writer encoding or real credentials are involved.
    & ([IO.Path]::GetFullPath($CheckpointBridge)) fixture $taskProfiles $taskProfileId
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $taskProfileFile)) { throw 'profile_fixture_failed' }
}
try {
    $null = New-Item -ItemType Directory -Path $taskRoot
    if (Test-Path -LiteralPath $taskScannerRoot) { throw 'scanner_fixture_conflict' }
    $taskOwnsScanner = $true
    Install-Owned ([IO.Path]::GetFullPath($InstallerPath)) $taskBinaryName '0'
    if (Test-Path -LiteralPath (Join-Path $taskInstall 'resources/scanner/component.zip')) { throw 'unselected_scanner_installed' }
    Check-Installed $false
    Save-SyntheticProfile
    Check-Installed $true
    Uninstall-Owned
    if (-not (Test-Path -LiteralPath $taskProfileFile)) { throw 'uninstall_removed_saved_profile' }
    Write-Output 'Fresh installation, native SDK loading and uninstall preserving the protected profile passed'
    # Optional component selection survives a subsequent silent upgrade without an override.
    Install-Owned ([IO.Path]::GetFullPath($InstallerPath)) $taskBinaryName '1'
    if (-not (Test-Path -LiteralPath (Join-Path $taskInstall 'resources/scanner/component.zip'))) { throw 'selected_scanner_missing' }
    Install-Owned ([IO.Path]::GetFullPath($InstallerPath))
    if (-not (Test-Path -LiteralPath (Join-Path $taskInstall 'resources/scanner/component.zip'))) { throw 'scanner_selection_not_preserved' }
    Check-Installed $true
    $preferences = Join-Path $taskScannerRoot 'preferences.json'
    $null = Wait-Condition { Test-Path -LiteralPath $preferences } 'bundled_scanner_not_adopted' 90
    if (-not (Get-Content -LiteralPath $preferences -Raw | ConvertFrom-Json).enabled) { throw 'bundled_scanner_not_enabled' }
    Uninstall-Owned
    # Preserve user scanner data on uninstall, remove only this test's isolated fixture below.
    if (-not (Test-Path -LiteralPath $preferences)) { throw 'scanner_preferences_removed_by_uninstall' }
    Remove-Item -LiteralPath $taskScannerRoot -Recurse -Force
    Write-Output 'Optional scanner selected, adopted offline, preserved across upgrade and stopped with the application'

    foreach ($previous in @($PreviousInstallerPath, $RecentInstallerPath)) {
        if (-not $previous) { continue }
        $baselineBinary = if ($previous -eq $PreviousInstallerPath) { $PreviousBinaryName } else { $taskBinaryName }
        Install-Owned ([IO.Path]::GetFullPath($previous)) $baselineBinary
        if ($baselineBinary -eq 'fit-connect-integration-client.exe') { Seed-LegacyShortcuts }
        Install-Owned ([IO.Path]::GetFullPath($InstallerPath))
        Check-Installed $true
        Uninstall-Owned
        if (-not (Test-Path -LiteralPath $taskProfileFile)) { throw 'upgrade_removed_saved_profile' }
        Write-Output ('Upgrade from pinned ' + [IO.Path]::GetFileName($previous) + ' preserved the DPAPI profile and loaded both SDKs')
    }
    if ($SignatureReportPath) {
        if ($taskSignatures.Count -ne 3) { throw 'installer_signature_report_incomplete' }
        [IO.File]::WriteAllText([IO.Path]::GetFullPath($SignatureReportPath), (@($taskSignatures.Values) | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    }
} finally {
    Stop-OwnedApp
    if ($taskOwnsScanner -and (Test-Path -LiteralPath $taskScannerRoot)) { Remove-Item -LiteralPath $taskScannerRoot -Recurse -Force }
    if ($taskOwnsProfiles -and (Test-Path -LiteralPath $taskProfiles)) { Remove-Item -LiteralPath $taskProfiles -Recurse -Force }
    foreach ($path in $taskLegacyShortcuts) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
    if (Test-Path -LiteralPath $taskRoot) { Remove-Item -LiteralPath $taskRoot -Recurse -Force }
}
