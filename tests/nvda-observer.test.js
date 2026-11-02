import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const powershell =
  process.env.FITCONNECT_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : null);
test(
  'NVDA fixture cleans its own scanner state after failure and preserves pre-existing user data',
  { skip: !powershell },
  () => {
    const program = `
$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$tree=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/windows-accessibility-smoke.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'parser_error' }
foreach ($name in @('Start-OwnedScannerFixture', 'Remove-OwnedScannerFixture')) {
  $definition=$tree.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  if (-not $definition) { throw 'fixture_function_missing' }
  . ([scriptblock]::Create($definition.Extent.Text))
}
$taskScannerRoot=Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
$taskOwnsScanner=$false
try {
  New-Item -ItemType Directory -Path $taskScannerRoot | Out-Null
  $sentinel=Join-Path $taskScannerRoot 'existing-user-data'
  [IO.File]::WriteAllText($sentinel, 'preserve')
  $rejected=$false
  try { Start-OwnedScannerFixture } catch { $rejected=$_.Exception.Message -eq 'a11y_scanner_fixture_conflict' }
  Remove-OwnedScannerFixture
  if (-not $rejected -or $taskOwnsScanner -or [IO.File]::ReadAllText($sentinel) -ne 'preserve') { throw 'existing_data_changed' }
  Remove-Item -LiteralPath $taskScannerRoot -Recurse -Force
  try {
    Start-OwnedScannerFixture
    New-Item -ItemType Directory -Path $taskScannerRoot | Out-Null
    [IO.File]::WriteAllText($sentinel, 'synthetic test state')
    throw 'simulated_app_test_failure'
  } catch {
    if ($_.Exception.Message -ne 'simulated_app_test_failure') { throw }
  } finally { Remove-OwnedScannerFixture }
  if ((Test-Path -LiteralPath $taskScannerRoot) -or $taskOwnsScanner) { throw 'owned_state_not_cleaned' }
  Start-OwnedScannerFixture
  Remove-OwnedScannerFixture
  'NVDA scanner isolation passed'
} finally {
  if (Test-Path -LiteralPath $taskScannerRoot) { Remove-Item -LiteralPath $taskScannerRoot -Recurse -Force }
}
`;
    const result = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', program], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.match(result, /NVDA scanner isolation passed/);
  },
);
test(
  'NVDA fixture activates the native WebView input before asking for focused-control speech',
  { skip: !powershell },
  () => {
    const program = `
$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$tree=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/windows-accessibility-smoke.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'parser_error' }
$definition=$tree.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-KeyboardFixture'},$true)
if (-not $definition) { throw 'native_input_bootstrap_missing' }
. ([scriptblock]::Create($definition.Extent.Text))
Add-Type -TypeDefinition 'public static class AccessibilityKeys { public static int Clicks=0; public static bool Active=false; public static bool AllowFocus=true; public static bool FocusWindow(System.IntPtr window) { Active=AllowFocus && window.ToInt64()==1234; return Active; } public static void ActivateInput(int x, int y) { if (!Active) throw new System.Exception("native_window_not_focused"); if (x!=120 || y!=240) throw new System.Exception("wrong_control"); Clicks++; } }'
$script:taskInputActive=$false
$script:taskWindow=[PSCustomObject]@{ Current=[PSCustomObject]@{ NativeWindowHandle=1234 } }
$script:events=[Collections.Generic.List[string]]::new()
function Wait-Check([scriptblock]$Check,[string]$Code) { $value=& $Check; if (-not $value) { throw $Code }; $value }
function Find-Control([string]$Name, $Type) {
  $script:events.Add($Name)
  $control=[PSCustomObject]@{ Name=$Name }
  $control | Add-Member -MemberType ScriptMethod -Name GetClickablePoint -Value { [PSCustomObject]@{ X=120; Y=240 } }
  $control
}
function Invoke-Control($Element) { if ($Element.Name -ne 'Verbinden') { throw 'unexpected_invocation' }; $script:events.Add('open') }
Start-KeyboardFixture 'Button' 'Edit'
if (-not $taskInputActive -or [AccessibilityKeys]::Clicks -ne 1 -or ($events -join ',') -ne 'Verbinden,open,Client-ID') { throw 'native_input_not_activated' }
[AccessibilityKeys]::AllowFocus=$false; [AccessibilityKeys]::Clicks=0; $script:events.Clear()
$refused=$false
try { Start-KeyboardFixture 'Button' 'Edit' } catch { $refused=$_.Exception.Message -eq 'a11y_window_not_foreground' }
if (-not $refused -or [AccessibilityKeys]::Clicks -ne 0 -or $events.Count -ne 0) { throw 'input_to_unowned_foreground' }

$body=($tree.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] } | Select-Object -First 1).Body.Extent.Text
$bootstrap=$body.IndexOf('Start-KeyboardFixture $buttonType $editType')
$firstSpeech=$body.IndexOf('Check-Spoken ')
if ($bootstrap -lt 0 -or $firstSpeech -lt $bootstrap) { throw 'speech_before_native_input' }
'NVDA native input bootstrap passed'
`;
    const result = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', program], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.match(result, /NVDA native input bootstrap passed/);
  },
);
test('NVDA observer retains the expanded keyboard journey and explicitly signals its bounded limit', () => {
  const source = fileURLToPath(new URL('../scripts/ci/nvda-capture.py', import.meta.url));
  const program = `
import contextlib, importlib.util, io, json, sys, types
sys.dont_write_bytecode=True
for name in ['api','buildVersion','inputCore','globalPluginHandler','speech','speech.extensions']:
    sys.modules[name]=types.ModuleType(name)
sys.modules['globalPluginHandler'].GlobalPlugin=object
sys.modules['speech.extensions'].pre_speech=object()
spec=importlib.util.spec_from_file_location('observer',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
class MemoryCapture:
    def __init__(self): self.buffer=io.StringIO()
    def open(self, mode, encoding):
        assert mode == 'a' and encoding == 'utf-8'
        return contextlib.nullcontext(self.buffer)
    def records(self): return [json.loads(line) for line in self.buffer.getvalue().splitlines()]
def exercise():
    observer=module.GlobalPlugin.__new__(module.GlobalPlugin); observer.path=MemoryCapture(); observer.count=0
    # This validates recorder capacity only; the Windows job separately observes real NVDA speech.
    # Use memory here so thousands of file opens do not measure antivirus/disk latency.
    labels=['control-'+str(index) for index in range(14)]
    for label in labels:
        for step in range(60):
            observer.write({'key':9,'pressed':True}); observer.write({'key':9,'pressed':False}); observer.write({'text':'fictional focus','focus':'other'})
        observer.write({'text':label,'focus':label})
    # A known combo-box name must be retained, without rewriting actual generated speech.
    observer.owns_focus=lambda: True
    sys.modules['api'].getFocusObject=lambda: types.SimpleNamespace(name='Umgebung')
    observer.observe(['Umgebung', 'combo box', 'TEST'])
    assert observer.path.records()[-1] == {'text':'Umgebung combo box TEST','focus':'Umgebung'}
    sys.modules['api'].getFocusObject=lambda: types.SimpleNamespace(name='synthetic-unknown-control')
    observer.observe(['fictional unclassified control'])
    assert observer.path.records()[-1]['focus'] == '(other control)'
    records=observer.path.records()
    assert all(any(record.get('focus')==label for record in records) for label in labels), 'expanded journey was truncated'
    for index in range(module.MAX_RECORDS+1): observer.write({'text':'bounded'})
    records=observer.path.records()
    assert len(records)==module.MAX_RECORDS
    assert records[-1]=={'captureLimitReached':True}
exercise()
print('bounded expanded NVDA capture passed')
`;
  const result = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', program, source], {
    encoding: 'utf8',
    // This checks retained records, not interpreter startup speed. Windows Defender can
    // delay a cold Python process. The actual NVDA journey has its own bounded timeout.
    timeout: process.platform === 'win32' ? 30000 : 10000,
  });
  assert.match(result, /bounded expanded NVDA capture passed/);
});
