[CmdletBinding()]
param([Parameter(Mandatory)][int]$ApplicationId, [Parameter(Mandatory)][string]$Folder, [switch]$Cancel, [switch]$SchemaReview, [switch]$AttachmentReview, [switch]$ScannerReview, [switch]$ScannerUpdate, [switch]$SaveFile, [string]$FileName, [string]$DialogTitle = 'Datei speichern')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
trap {
    $code = $_.Exception.Message
    if ($code -notmatch '^ui_[a-z_]+$') { $code = 'ui_folder_driver_failed' }
    Write-Output $code
    if ($code -eq 'ui_export_warning_missing') {
        $pidCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ApplicationId)
        $windowCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)
        $both = [System.Windows.Automation.AndCondition]::new($pidCondition, $windowCondition)
        $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $both)
        Write-Output ('ui_folder_diagnostic owned_windows=' + $windows.Count)
        $expected = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Nachrichten herunterladen')
        $found = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $expected)
        Write-Output ('ui_folder_diagnostic expected_title_nodes=' + $found.Count)
    }
    exit 1
}
if ($env:GITHUB_REPOSITORY -ne 'FBForge/fbforge-connect' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'ui_folder_context_denied' }
$ownedRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
$target = [IO.Path]::GetFullPath($Folder)
if (-not $target.StartsWith($ownedRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $target -PathType Container)) { throw 'ui_folder_path_denied' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ExportWindowFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
}
'@
function Wait-Ui([scriptblock]$Check, [string]$Code) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $value = & $Check
        if ($value) { return $value }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $Code
}
function Find-Dialog([string]$Title) {
    # Resolve the owned HWND first: native modal ownership is not always reflected
    # as a direct desktop child in WebView2's UI Automation tree.
    $handle = [IntPtr]::Zero
    for ($index = 0; $index -lt 32; $index++) {
        $handle = [ExportWindowFocus]::FindWindowEx([IntPtr]::Zero, $handle, $null, $Title)
        if ($handle -eq [IntPtr]::Zero) { break }
        [uint32]$ownerProcess = 0
        $null = [ExportWindowFocus]::GetWindowThreadProcessId($handle, [ref]$ownerProcess)
        if ($ownerProcess -eq $ApplicationId) { return [System.Windows.Automation.AutomationElement]::FromHandle($handle) }
    }
    $process = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ApplicationId)
    $name = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Title)
    $condition = [System.Windows.Automation.AndCondition]::new($process, $name)
    # Owned native modal dialogs can be descendants of the main window in UIA.
    return [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Invoke-Button($Root, [string]$Name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    $button = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if (-not $button -or $button.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) { throw 'ui_folder_button_missing' }
    $button.SetFocus()
    $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
}
function Test-DownloadsDirectory([string]$Actual, [string]$Expected, [string]$KnownFolderLabel) {
    if ([string]::IsNullOrWhiteSpace($Actual) -or [string]::IsNullOrWhiteSpace($Expected)) { return $false }
    if ($Actual.TrimEnd('\').Equals($Expected.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { return $true }
    return (-not [string]::IsNullOrWhiteSpace($KnownFolderLabel) -and $Actual.Equals($KnownFolderLabel, [StringComparison]::OrdinalIgnoreCase))
}
if ($SaveFile) {
    if (-not $FileName -or [IO.Path]::GetFileName($FileName) -ne $FileName -or $FileName -match '[\\/:]') { throw 'ui_file_name_denied' }
    if ($DialogTitle -notin @('Datei speichern', 'Geschütztes Profil sichern')) { throw 'ui_file_title_denied' }
    $dialog = Wait-Ui { Find-Dialog $DialogTitle } 'ui_file_dialog_missing'
    $handle = [IntPtr]$dialog.Current.NativeWindowHandle
    $null = [ExportWindowFocus]::SetForegroundWindow($handle)
    $null = Wait-Ui { [ExportWindowFocus]::GetForegroundWindow() -eq $handle } 'ui_file_focus_missing'
    if ($Cancel) {
        $button = Wait-Ui {
            foreach ($name in @('Cancel', 'Abbrechen')) {
                $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
                $element = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
                if ($element -and $element.Current.IsEnabled) { return $element }
            }
        } 'ui_file_cancel_missing'
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output 'Native file save cancelled'
        exit 0
    }
    $shell = New-Object -ComObject WScript.Shell
    try {
        # Known folders can be redirected and their address can be a shell display name.
        # Wait for the address edit, not the previously focused file-name edit.
        $nameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1001')
        $editCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
        $both = [System.Windows.Automation.AndCondition]::new($nameCondition, $editCondition)
        $nameEdit = Wait-Ui {
            foreach ($name in @('File name:', 'File name', 'Dateiname:', 'Dateiname')) {
                $labelCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
                $labeledEdit = [System.Windows.Automation.AndCondition]::new($labelCondition, $editCondition)
                $candidate = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $labeledEdit)
                if ($candidate -and $candidate.Current.IsEnabled -and -not $candidate.Current.IsOffscreen) { return $candidate }
            }
        } 'ui_file_name_control_missing'
        $nameRuntime = $nameEdit.GetRuntimeId() -join ','
        $shell.SendKeys('^l')
        Start-Sleep -Milliseconds 200
        $address = Wait-Ui {
            $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
            if ($focused.Current.ProcessId -eq $ApplicationId -and $focused.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and ($focused.GetRuntimeId() -join ',') -ne $nameRuntime) { return $focused }
        } 'ui_file_address_missing'
        $initial = $address.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
        $expected = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
        $label = ''
        $folders = New-Object -ComObject Shell.Application
        try {
            $downloads = $folders.Namespace('shell:Downloads')
            if ($downloads) { $expected = $downloads.Self.Path; $label = $downloads.Title }
        } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($folders) }
        if (-not (Test-DownloadsDirectory $initial $expected $label)) {
            Write-Output ('ui_file_diagnostic address_is_absolute=' + [IO.Path]::IsPathRooted($initial).ToString().ToLowerInvariant())
            Write-Output ('ui_file_diagnostic known_folder_available=' + (-not [string]::IsNullOrWhiteSpace($label)).ToString().ToLowerInvariant())
            throw 'ui_file_download_default_missing'
        }
        $edit = $nameEdit
        $destination = Join-Path $target $FileName
        $edit.SetFocus()
        $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($destination)
        $null = Wait-Ui { $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value -eq $destination } 'ui_file_name_not_applied'
        $shell.SendKeys('{TAB}')
        Start-Sleep -Milliseconds 200
        $button = Wait-Ui {
            foreach ($name in @('Save', 'Speichern')) {
                $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
                $element = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
                if ($element -and $element.Current.IsEnabled) { return $element }
            }
        } 'ui_file_save_missing'
        $button.SetFocus()
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        $null = Wait-Ui { -not (Find-Dialog $DialogTitle) } 'ui_file_save_not_closed'
        Write-Output ('ui_file_diagnostic expected_file_exists=' + (Test-Path -LiteralPath $destination -PathType Leaf).ToString().ToLowerInvariant())
        Write-Output 'Native file save confirmed with Downloads default and owned output path'
        exit 0
    } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
if ($ScannerUpdate) {
    $notice = Wait-Ui { Find-Dialog 'Virensignaturen aktualisieren?' } 'ui_signature_warning_missing'
    Invoke-Button $notice 'Signaturen aktualisieren'
    Write-Output 'Native signature-update confirmation handled'
    exit 0
}
if ($AttachmentReview -or $ScannerReview) {
    $title = if ($AttachmentReview) { 'Mit gesperrten Anlagen annehmen?' } else { 'Eigene Scanner-Gegenstelle verwenden?' }
    $action = if ($AttachmentReview) { 'Mit Anlagenproblemen annehmen' } else { 'Scanner aktivieren' }
    $notice = Wait-Ui {
        $dialog = Find-Dialog $title
        if (-not $dialog -and $ScannerReview) { $dialog = Find-Dialog 'Lokalen Virenscan aktivieren?' }
        return $dialog
    } 'ui_scanner_warning_missing'
    Invoke-Button $notice $(if ($Cancel) { 'Abbrechen' } else { $action })
    Write-Output 'Native scanner-review confirmation handled'
    exit 0
}
if ($SchemaReview) {
    $notice = Wait-Ui { Find-Dialog 'Trotz Schemaabweichungen annehmen?' } 'ui_schema_warning_missing'
    Invoke-Button $notice $(if ($Cancel) { 'Abbrechen' } else { 'Trotz Abweichungen annehmen' })
    Write-Output 'Native schema-review confirmation handled'
    exit 0
}
$notice = Wait-Ui { Find-Dialog 'Nachrichten herunterladen' } 'ui_export_warning_missing'
Invoke-Button $notice $(if ($Cancel) { 'Abbrechen' } else { 'Zielordner wählen' })
if ($Cancel) { Write-Output 'Native plaintext-export warning cancelled'; exit 0 }
$dialog = Wait-Ui { Find-Dialog 'Zielordner für Nachrichten' } 'ui_export_folder_dialog_missing'
$handle = [IntPtr]$dialog.Current.NativeWindowHandle
$null = [ExportWindowFocus]::SetForegroundWindow($handle)
$null = Wait-Ui { [ExportWindowFocus]::GetForegroundWindow() -eq $handle } 'ui_folder_focus_missing'
$shell = New-Object -ComObject WScript.Shell
try {
    $shell.SendKeys('^l')
    $edit = Wait-Ui {
        $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
        if ($focused.Current.ProcessId -eq $ApplicationId -and $focused.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit) { return $focused }
    } 'ui_folder_address_missing'
    $value = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $value.SetValue($target)
    $shell.SendKeys('{ENTER}')
    $null = Wait-Ui {
        $controls = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($control in $controls) {
            if ($control.Current.Name.EndsWith($target, [StringComparison]::OrdinalIgnoreCase)) { return $true }
        }
        return $false
    } 'ui_folder_navigation_unconfirmed'
    # English hosted Windows and German local labels are the same native folder picker action.
    $button = Wait-Ui {
        foreach ($name in @('Select Folder', 'Select folder', 'Ordner auswählen')) {
            $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
            $element = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
            if ($element -and $element.Current.IsEnabled) { return $element }
        }
    } 'ui_folder_select_missing'
    $button.SetFocus()
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Write-Output 'Native plaintext-export warning and owned folder selection confirmed'
} finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
