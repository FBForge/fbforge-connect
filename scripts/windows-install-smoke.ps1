[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][string]$CheckpointBridge,
    [string]$PreviousInstallerPath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$taskRoot = Join-Path $env:RUNNER_TEMP ('fitconnect-install-' + [Guid]::NewGuid().ToString('N'))
$taskInstall = Join-Path $taskRoot 'application files'
$taskProfiles = Join-Path $env:APPDATA 'org.fitconnect.integration-client\profiles'
$taskProfileId = [Guid]::NewGuid().ToString()
$taskProfileFile = Join-Path $taskProfiles ($taskProfileId + '.profile')
$taskApp = $null
$taskJavaIds = @()
$taskOwnsProfiles = $false

function Wait-Condition([scriptblock]$Check, [string]$Failure, [int]$Seconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $value = & $Check
        if ($value) { return $value }
        Start-Sleep -Milliseconds 400
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $Failure
}
function Install-Owned([string]$Setup) {
    if (-not (Test-Path -LiteralPath $Setup -PathType Leaf)) { throw 'installer_missing' }
    # NSIS requires /D last; the remaining command line is the destination, including spaces.
    $install = Start-Process -FilePath $Setup -ArgumentList ('/S /D=' + $taskInstall) -PassThru
    if (-not $install.WaitForExit(120000)) { $install.Kill(); throw 'installer_timeout' }
    if ($install.ExitCode -ne 0) { throw 'installer_failed' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskInstall 'fit-connect-integration-client.exe'))) { throw 'installed_binary_missing' }
}
function Stop-OwnedApp {
    if ($script:taskApp) {
        if (-not $script:taskApp.HasExited) {
            $script:taskJavaIds = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $script:taskApp.Id + " AND Name = 'java.exe'") | ForEach-Object { [int]$_.ProcessId })
            $null = $script:taskApp.CloseMainWindow()
            if (-not $script:taskApp.WaitForExit(15000)) { $script:taskApp.Kill(); $script:taskApp.WaitForExit() }
        }
        foreach ($childId in $script:taskJavaIds) { Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue }
        $script:taskApp.Dispose(); $script:taskApp = $null; $script:taskJavaIds = @()
    }
}
function Find-Named($Root, [string]$Name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    return $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Invoke-Named($Root, [string]$Name) {
    $element = Wait-Condition { Find-Named $Root $Name } 'installer_ui_control_missing'
    $pattern = $null
    if (-not $element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { throw 'installer_ui_invoke_unavailable' }
    $pattern.Invoke()
}
function Check-Installed([bool]$ExpectProfile) {
    $info = [System.Diagnostics.ProcessStartInfo]::new((Join-Path $taskInstall 'fit-connect-integration-client.exe'))
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
        if ($window.Current.Name -notlike '*FIT-Connect Test-Client*') { throw 'installed_title_invalid' }
        Invoke-Named $window 'Diagnose'
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
    $taskProfile = @{ version = 1; profileId = $taskProfileId; name = 'CI TEST Profil'; apiVersion = 'v3'; role = 'online-service'; clientId = 'ci-checkpoint-only'; clientSecret = 'not-an-oauth-credential'; keys = @(); defaults = @{ sourceDestination = $null; receiverDestination = '33333333-3333-4333-8333-333333333333' } }
    $info = [System.Diagnostics.ProcessStartInfo]::new([IO.Path]::GetFullPath($CheckpointBridge))
    $info.UseShellExecute = $false; $info.RedirectStandardInput = $true; $info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    if ($taskProfiles.Contains('"')) { throw 'profile_fixture_path_invalid' }
    $info.Arguments = 'save "' + $taskProfiles + '" ' + $taskProfileId
    $bridge = [System.Diagnostics.Process]::Start($info)
    $bridge.StandardInput.Write(($taskProfile | ConvertTo-Json -Depth 8 -Compress)); $bridge.StandardInput.Close()
    if (-not $bridge.WaitForExit(30000)) { $bridge.Kill(); throw 'profile_fixture_timeout' }
    if ($bridge.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $taskProfileFile)) { throw 'profile_fixture_failed' }
    $bridge.Dispose()
}
try {
    $null = New-Item -ItemType Directory -Path $taskRoot
    Install-Owned ([IO.Path]::GetFullPath($InstallerPath))
    Check-Installed $false
    Save-SyntheticProfile
    Check-Installed $true
    Uninstall-Owned
    if (-not (Test-Path -LiteralPath $taskProfileFile)) { throw 'uninstall_removed_saved_profile' }
    Write-Output 'Fresh installation, native SDK loading and uninstall preserving the protected profile passed'
    if ($PreviousInstallerPath) {
        Install-Owned ([IO.Path]::GetFullPath($PreviousInstallerPath))
        Install-Owned ([IO.Path]::GetFullPath($InstallerPath))
        Check-Installed $true
        Uninstall-Owned
        if (-not (Test-Path -LiteralPath $taskProfileFile)) { throw 'upgrade_removed_saved_profile' }
        Write-Output 'Upgrade from the pinned dev.7 installer preserved the DPAPI profile and loaded both SDKs'
    }
} finally {
    Stop-OwnedApp
    if ($taskOwnsProfiles -and (Test-Path -LiteralPath $taskProfiles)) { Remove-Item -LiteralPath $taskProfiles -Recurse -Force }
    if (Test-Path -LiteralPath $taskRoot) { Remove-Item -LiteralPath $taskRoot -Recurse -Force }
}
