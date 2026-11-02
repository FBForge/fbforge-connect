import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const powershell =
  process.env.FITCONNECT_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : null);

test(
  'installer navigation reconciles a lost UIA invocation once without retrying content operations',
  { skip: !powershell },
  () => {
    const program = `
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$tree=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/windows-install-smoke.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'parser_error' }
foreach ($name in @('Open-Diagnostics','Invoke-DiagnosticsPointer')) {
 $definition=$tree.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 . ([scriptblock]::Create($definition.Extent.Text))
}
Add-Type -TypeDefinition 'public static class InstallerWindowFocus { public static bool Allow=true; public static int Clicks=0; public static bool SetForegroundWindow(System.IntPtr window) { return Allow; } public static System.IntPtr GetForegroundWindow() { return new System.IntPtr(Allow ? 123 : 0); } public static void ClickPoint(int x,int y) { if(x!=120 || y!=240) throw new System.Exception("wrong_point"); Clicks++; } }'
$root=[pscustomobject]@{Current=[pscustomobject]@{NativeWindowHandle=123;BoundingRectangle=[pscustomobject]@{Left=0;Top=0;Right=500;Bottom=500}}}
$button=[pscustomobject]@{Current=[pscustomobject]@{Name='Diagnose'}}
$button | Add-Member ScriptMethod GetClickablePoint { [pscustomobject]@{X=120;Y=240} }
$script:invokes=0
function Find-Button($Root,[string]$Name) {
 if($Name -eq 'Diagnose') { return $button }
 if($Name -eq 'Komponenten prüfen' -and [InstallerWindowFocus]::Clicks) { return [pscustomobject]@{Current=[pscustomobject]@{IsOffscreen=$false}} }
}
function Invoke-Named($Root,[string]$Name) { if($Name -ne 'Diagnose') { throw 'unexpected_write' }; $script:invokes++ }
function Wait-Condition([scriptblock]$Check,[string]$Failure) { for($i=0;$i -lt 5;$i++) { if(& $Check) {return} }; throw $Failure }
Open-Diagnostics $root ([TimeSpan]::Zero)
if($script:invokes -ne 1 -or [InstallerWindowFocus]::Clicks -ne 1) { throw 'navigation_not_reconciled_once' }
Open-Diagnostics $root ([TimeSpan]::Zero)
if($script:invokes -ne 1 -or [InstallerWindowFocus]::Clicks -ne 1) { throw 'ready_navigation_repeated' }
function Expect-Rejected([scriptblock]$Action,[string]$Code) {try {& $Action} catch {if($_.Exception.Message -ne $Code){throw};return};throw 'guard_missing'}
[InstallerWindowFocus]::Allow=$false
Expect-Rejected {Invoke-DiagnosticsPointer $root $button} 'installer_navigation_window_not_foreground'
[InstallerWindowFocus]::Allow=$true
$root.Current.BoundingRectangle.Right=100
Expect-Rejected {Invoke-DiagnosticsPointer $root $button} 'installer_navigation_point_outside_window'
$root.Current.BoundingRectangle.Right=500
$button.Current.Name='Senden'
Expect-Rejected {Invoke-DiagnosticsPointer $root $button} 'installer_navigation_target_invalid'
if([InstallerWindowFocus]::Clicks -ne 1){throw 'unsafe_pointer_action'}
'installer navigation guards passed'
`;
    assert.match(
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', program], {
        encoding: 'utf8',
        timeout: 15000,
      }),
      /installer navigation guards passed/,
    );
  },
);
