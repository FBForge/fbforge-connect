[CmdletBinding()]
param([Parameter(Mandatory)][int]$ApplicationId, [Parameter(Mandatory)][int]$ExpectedPort)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = [Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ('desktop_bootstrap elevated_host=' + $admin.ToString().ToLowerInvariant())
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ApplicationId)
$windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
Write-Output ('desktop_bootstrap app_windows=' + $windows.Count)
$ready = $false
foreach ($window in $windows) {
    $name = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Senden')
    if ($window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $name)) { $ready = $true }
}
Write-Output ('desktop_bootstrap navigation_ready=' + $ready.ToString().ToLowerInvariant())
$all = @(Get-CimInstance Win32_Process)
$owned = @($ApplicationId)
for ($depth = 0; $depth -lt 4; $depth++) {
    $next = @($all | Where-Object { $owned -contains [int]$_.ParentProcessId -and $owned -notcontains [int]$_.ProcessId } | ForEach-Object { [int]$_.ProcessId })
    if (-not $next.Count) { break }
    $owned += $next
}
$webviews = @($all | Where-Object { $owned -contains [int]$_.ProcessId -and $_.Name -eq 'msedgewebview2.exe' })
Write-Output ('desktop_bootstrap webview_processes=' + $webviews.Count)
$hasArgument = @($webviews | Where-Object { $_.CommandLine -match '--remote-debugging-port=' }).Count -gt 0
$matchesPort = @($webviews | Where-Object { $_.CommandLine -match ('--remote-debugging-port=' + $ExpectedPort + '(?:\s|$)') }).Count -gt 0
Write-Output ('desktop_bootstrap debugging_argument=' + $hasArgument.ToString().ToLowerInvariant())
Write-Output ('desktop_bootstrap expected_debug_port=' + $matchesPort.ToString().ToLowerInvariant())
$listening = @(Get-NetTCPConnection -State Listen -LocalPort $ExpectedPort -ErrorAction SilentlyContinue).Count -gt 0
Write-Output ('desktop_bootstrap port_listening=' + $listening.ToString().ToLowerInvariant())
