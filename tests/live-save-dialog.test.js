import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const shell = process.env.FITCONNECT_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : null);
test(
  'native save acceptance recognizes redirected and shell-named Downloads but rejects a filename or another folder',
  { skip: !shell },
  () => {
    const script = `
$tokens=$null; $errors=$null
$tree=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/live-ui/select-export-folder.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'parser_error' }
$definition=$tree.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-DownloadsDirectory'},$true)
. ([scriptblock]::Create($definition.Extent.Text))
if (-not (Test-DownloadsDirectory 'D:\\Redirected\\Downloads' 'D:\\Redirected\\Downloads' 'Downloads')) { throw 'redirected_folder_rejected' }
if (-not (Test-DownloadsDirectory 'Downloads' 'D:\\Redirected\\Downloads' 'Downloads')) { throw 'shell_name_rejected' }
if (-not (Test-DownloadsDirectory 'c:\\users\\test\\downloads\\' 'C:\\Users\\Test\\Downloads' 'Downloads')) { throw 'normalization_rejected' }
if (Test-DownloadsDirectory 'test-profil.fctest-profile' 'C:\\Users\\Test\\Downloads' 'Downloads') { throw 'filename_accepted_as_address' }
if (Test-DownloadsDirectory 'C:\\OtherFolder' 'C:\\Users\\Test\\Downloads' 'Downloads') { throw 'wrong_folder_accepted' }
if (Test-DownloadsDirectory '' 'C:\\Users\\Test\\Downloads' '') { throw 'empty_address_accepted' }
'Native save acceptance directory checks passed'
`;
    const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /directory checks passed/);
  },
);
