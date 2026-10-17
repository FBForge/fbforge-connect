[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][string]$ExpectedBinaryPath,
    [Parameter(Mandatory)][string]$NvdaPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AccessibilityKeys {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    public static void Press(byte key) { keybd_event(key,0,0,UIntPtr.Zero); keybd_event(key,0,2,UIntPtr.Zero); }
    public static void ReportFocus() {
        keybd_event(0x2d,0,0,UIntPtr.Zero); // NVDA's standard Insert+Tab command.
        System.Threading.Thread.Sleep(40);
        Press(0x09);
        keybd_event(0x2d,0,2,UIntPtr.Zero);
    }
}
'@
$taskRoot = Join-Path $env:RUNNER_TEMP ('fbforge-accessibility-' + [Guid]::NewGuid().ToString('N'))
$taskInstall = Join-Path $taskRoot 'application files'
$taskConfig = Join-Path $taskRoot 'nvda-config'
$taskCapture = Join-Path $taskRoot 'speech.jsonl'
$taskApp = $null
$taskNvda = $null
$taskWindow = $null
$checks = [Collections.Generic.List[object]]::new()

function Wait-Check([scriptblock]$Check, [string]$Code, [int]$Seconds = 30) {
    $until = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $value = & $Check
        if ($value) { return $value }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $until)
    throw $Code
}
function Find-Control([string]$Name, $Type) {
    $nameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    $typeCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $Type)
    $condition = [System.Windows.Automation.AndCondition]::new($nameCondition, $typeCondition)
    $taskWindow.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Read-Capture {
    if (-not (Test-Path -LiteralPath $taskCapture)) { return @() }
    try { @(Get-Content -LiteralPath $taskCapture -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json }) }
    catch { @() } # A concurrent append is retried by the bounded wait.
}
function Check-Spoken([string]$Name, $Type) {
    $element = Wait-Check { Find-Control $Name $Type } ('a11y_control_missing:' + $Name)
    if (-not $element.Current.IsKeyboardFocusable) { throw ('a11y_not_focusable:' + $Name) }
    $before = @(Read-Capture).Count
    $null = [AccessibilityKeys]::SetForegroundWindow([IntPtr]$taskWindow.Current.NativeWindowHandle)
    $element.SetFocus()
    Start-Sleep -Milliseconds 300
    [AccessibilityKeys]::ReportFocus()
    $spoken = Wait-Check {
        $records = @(Read-Capture)
        if ($records.Count -le $before) { return $false }
        foreach ($record in $records[$before..($records.Count - 1)]) {
            if ($record.PSObject.Properties.Name -contains 'text' -and $record.text.IndexOf($Name, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $record.text }
        }
        return $false
    } ('nvda_label_not_spoken:' + $Name) 15
    if ($Name -eq 'Client-Secret' -and -not $element.Current.IsPassword) { throw 'a11y_secret_not_protected' }
    $checks.Add([ordered]@{ name = $Name; role = $Type.ProgrammaticName; speech = $spoken })
    Write-Output ('NVDA generated the focused control label: ' + $Name)
    return $element
}
function Invoke-Control($Element) {
    $pattern = $null
    if (-not $Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { throw 'a11y_invoke_missing' }
    $pattern.Invoke()
}
function Start-Clean([string]$Executable, [string]$Arguments = '') {
    $info = [Diagnostics.ProcessStartInfo]::new([IO.Path]::GetFullPath($Executable))
    $info.UseShellExecute = $false; $info.Arguments = $Arguments
    foreach ($key in @('JAVA_HOME','JDK_HOME','JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH','GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','SENDERID','SENDERSECRET','SENDERDEST','SUBSCRIBERID','SUBSCRIBERSECRET')) { $null = $info.EnvironmentVariables.Remove($key) }
    $info.EnvironmentVariables['PATH'] = "$env:SystemRoot\System32;$env:SystemRoot"
    return $info
}
try {
    if (@(Get-Process -Name 'nvda','nvda_noUIAccess' -ErrorAction SilentlyContinue).Count) { throw 'existing_screen_reader_conflict' }
    $null = New-Item -ItemType Directory -Path (Join-Path $taskConfig 'scratchpad\globalPlugins') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ci\nvda-capture.py') -Destination (Join-Path $taskConfig 'scratchpad\globalPlugins\fbforgeCapture.py')
    $config = @'
[general]
language = en
saveConfigurationOnExit = False
askToExit = False
playStartAndExitSounds = False
showWelcomeDialogAtStartup = False
[speech]
synth = silence
[development]
enableScratchpadDir = True
[update]
autoCheck = False
startupNotification = False
allowUsageStats = False
askedAllowUsageStats = True
[addonStore]
automaticUpdates = disabled
'@
    [IO.File]::WriteAllText((Join-Path $taskConfig 'nvda.ini'), $config, [Text.UTF8Encoding]::new($false))
    $setup = Start-Process -FilePath ([IO.Path]::GetFullPath($InstallerPath)) -ArgumentList ('/S /D=' + $taskInstall) -PassThru
    if (-not $setup.WaitForExit(120000) -or $setup.ExitCode -ne 0) { throw 'a11y_install_failed' }
    $binary = Join-Path $taskInstall 'fit-connect-integration-client.exe'
    if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $ExpectedBinaryPath -Algorithm SHA256).Hash) { throw 'a11y_binary_revision_mismatch' }
    $taskApp = [Diagnostics.Process]::Start((Start-Clean $binary))
    $taskWindow = Wait-Check {
        if ($taskApp.HasExited) { throw 'a11y_app_exited' }
        $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $taskApp.Id)
        [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
    } 'a11y_window_missing'
    if ($taskWindow.Current.Name -ne 'FBForge Connect · FIT-Connect TEST') { throw 'a11y_title_mismatch' }
    $info = Start-Clean $NvdaPath ('--minimal --config-path="' + $taskConfig + '" --log-file="' + (Join-Path $taskRoot 'nvda.log') + '"')
    $info.EnvironmentVariables['FBFC_A11Y_CAPTURE'] = $taskCapture
    $info.EnvironmentVariables['FBFC_A11Y_WINDOW'] = [string]$taskWindow.Current.NativeWindowHandle
    $taskNvda = [Diagnostics.Process]::Start($info)
    $ready = Wait-Check {
        if ($taskNvda.HasExited) { throw 'nvda_exited' }
        @(Read-Capture) | Where-Object { $_.PSObject.Properties.Name -contains 'ready' -and $_.ready } | Select-Object -First 1
    } 'nvda_observer_not_ready' 60
    if ($ready.nvdaVersion -ne '2026.2') { throw 'nvda_version_mismatch' }
    $buttonType = [System.Windows.Automation.ControlType]::Button
    $editType = [System.Windows.Automation.ControlType]::Edit
    $connect = Check-Spoken 'Verbinden' $buttonType
    Invoke-Control $connect
    $null = Check-Spoken 'Client-ID' $editType
    [AccessibilityKeys]::Press(0x09)
    $null = Wait-Check { [System.Windows.Automation.AutomationElement]::FocusedElement.Current.Name -eq 'Client-Secret' } 'native_tab_order_invalid'
    $null = Check-Spoken 'Client-Secret' $editType
    $null = Check-Spoken 'Bei TEST anmelden' $buttonType
    [AccessibilityKeys]::Press(0x1b)
    $null = Wait-Check { [System.Windows.Automation.AutomationElement]::FocusedElement.Current.Name -eq 'Verbinden' } 'native_dialog_focus_not_restored'
    foreach ($name in @('Senden','Empfangen','Prozesse')) {
        $control = Check-Spoken $name $buttonType
        Invoke-Control $control
    }
    $demo = Check-Spoken 'Fiktiven Demo-Prozess öffnen' $buttonType
    Invoke-Control $demo
    $null = Check-Spoken 'Modell einpassen' $buttonType
    Write-Output ('Actual NVDA 2026.2 speech observation, ' + $checks.Count + ' control labels, protected field, native Tab order and Escape focus restoration passed')
    $report = [ordered]@{ application = 'FBForge Connect'; nvda = $ready.nvdaVersion; scope = 'Installed Windows WebView; generated speech sequences with silent synthesizer, not an auditory usability assessment'; checks = @($checks.ToArray()); keyboardTab = 'passed'; modalFocusRestoration = 'passed' }
    [IO.File]::WriteAllText((Join-Path $env:RUNNER_TEMP 'fbforge-accessibility-result.json'), ($report | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
} finally {
    if ($taskNvda) { if (-not $taskNvda.HasExited) { $taskNvda.Kill(); $taskNvda.WaitForExit() }; $taskNvda.Dispose() }
    if ($taskApp) {
        $java = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $taskApp.Id + " AND Name = 'java.exe'"))
        if (-not $taskApp.HasExited) {
            $null = $taskApp.CloseMainWindow()
            if (-not $taskApp.WaitForExit(10000)) { $taskApp.Kill(); $taskApp.WaitForExit() }
        }
        foreach ($child in $java) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }
        $taskApp.Dispose()
    }
    $uninstaller = Join-Path $taskInstall 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList ('/S _?=' + $taskInstall) -PassThru
        if (-not $uninstall.WaitForExit(120000)) { $uninstall.Kill() }
        $uninstall.Dispose()
    }
    if (Test-Path -LiteralPath $taskRoot) { Remove-Item -LiteralPath $taskRoot -Recurse -Force }
}
