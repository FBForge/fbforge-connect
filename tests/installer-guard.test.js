import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (name) => readFile(new URL(`../desktop/installer/${name}`, import.meta.url), 'utf8');
const body = (text, name) => {
  const start = text.indexOf(`Function ${name}\n`);
  assert.notEqual(start, -1, `function ${name}`);
  const from = start + `Function ${name}\n`.length;
  return text.slice(from, text.indexOf('FunctionEnd', from));
};
const section = (text, name) => {
  const start = text.indexOf(`Section ${name}\n`);
  assert.notEqual(start, -1, `section ${name}`);
  return text.slice(start, text.indexOf('SectionEnd', start));
};
const ordered = (text, ...steps) => {
  let previous = -1;
  for (const step of steps) {
    const current = text.indexOf(step);
    assert.ok(current > previous, `expected ordered step: ${step}`);
    previous = current;
  }
};
test('native V2 preparation precedes protected sections while uninstall keeps its deny gate', async () => {
  const text = await read('installer.nsi');
  const init = body(text, '.onInit');
  assert.match(init, /StrCpy \$FBForgeV2Complete 0[\s\S]*SetErrorLevel 70/);
  assert.doesNotMatch(init, /::PrepareV2|Call FBForgePrepareV2|WriteReg|CreateShortcut/);
  ordered(text, 'Section "-FBForge native preparation"', 'Section WebView2', 'Section Install');
  ordered(
    section(text, '"-FBForge native preparation"'),
    'Call FBForgeExtractPayload',
    'StrCpy $FBForgeV2Components "scanner"',
    'Call FBForgePrepareV2',
  );
  const v2 = await read('guard-v2.nsh');
  ordered(
    body(v2, 'FBForgePrepareV2'),
    '::PrepareV2 /NOUNLOAD "${FBFORGE_GUARD_TOOL_ID}" "$PLUGINSDIR" "$FBForgeV2Components"',
    'Call FBForgeV2ReadReply',
    'StrCmpS $FBForgeGuardReply "v2:preparing" 0 denied',
    'Call FBForgeWaitV2',
  );
  assert.ok(
    body(text, 'un.onInit').startsWith(
      '  Call un.FBForgeAcquire\n  Call un.FBForgeRequireMutationEvidence\n',
    ),
  );
  const guard = await read('guard.nsh');
  assert.ok(guard.includes('!define FBFORGE_GUARD_APP_ID "org.fitconnect.integration-client"'));
  const gate = body(guard, '${PREFIX}FBForgeRequireMutationEvidence');
  assert.ok(gate.includes('Call ${PREFIX}FBForgeRequireHeld'));
  assert.match(gate, /SetErrorLevel 70[\s\S]*Quit/);
  assert.doesNotMatch(gate, /Return|!if|!else|TODO|success/i);
});
test('protected V2 phases stage before publishing and never force shutdown or delegate uninstall', async () => {
  const all = (
    await Promise.all(
      ['installer.nsi', 'guard.nsh', 'guard-v2.nsh', 'safe-utils.nsh', 'compatibility.nsh'].map(read),
    )
  ).join('\n');
  assert.doesNotMatch(
    all,
    /CheckIfAppIsRunning|RmForceShutdown|RmShutdown|TerminateProcess|ExecWait ['"`]\$R1|_\?=/,
  );
  const text = await read('installer.nsi');
  ordered(
    section(text, 'WebView2'),
    'Call FBForgeRequireStagingV2',
    'Call FBForgeStagePathV2',
    'SetOutPath "$FBForgeV2Stage"',
    'ExecWait',
  );
  ordered(
    section(text, 'Install'),
    'Call FBForgePollV2',
    'Call FBForgeRequireStagingV2',
    'StrCpy $INSTDIR $FBForgeV2Stage',
    'File /a',
    'Call FBForgePublishV2',
    'Call FBForgeRequirePublishedV2',
    'StrCpy $INSTDIR $FBForgeV2Target',
    'WriteRegStr',
  );
  assert.match(section(text, 'Uninstall'), /^Section Uninstall\n {2}Call un.FBForgeRequireMutationEvidence/);
  const compatibility = await read('compatibility.nsh');
  assert.match(compatibility, /Call FBForgeRequireStagingV2/);
});
test('worker finalizes after shortcuts, releases with an exact ACK, and gates every launch', async () => {
  const text = await read('installer.nsi');
  assert.doesNotMatch(
    text,
    /MUI_(?:FINISHPAGE_SHOWREADME_FUNCTION|PAGE_CUSTOMFUNCTION_LEAVE) FBForgeFinalize/,
  );
  ordered(
    section(text, 'Install'),
    'Call CreateOrUpdateDesktopShortcut',
    'StrCpy $FBForgeShortcutsFinalized 1',
    'Call FBForgeFinalizeV2',
  );
  const v2 = await read('guard-v2.nsh');
  ordered(
    body(v2, 'FBForgeFinalizeV2'),
    'Call FBForgeRequirePublishedV2',
    '::FinalizeV2 /NOUNLOAD',
    'Call FBForgeWaitV2',
    'StrCpy $FBForgeV2Complete 1',
    '::ReleaseV2 /NOUNLOAD',
    'StrCmpS $FBForgeGuardReply "v2:released" 0 denied',
    'SetErrorLevel 0',
  );
  for (const name of ['RunMainBinary', '.onInstSuccess']) {
    ordered(body(text, name), 'Call FBForgeRequireCompletedV2', 'RunAsUser');
  }
  const completed = body(v2, 'FBForgeRequireCompletedV2');
  assert.match(completed, /StrCmpS \$FBForgeInstallFailed 1 denied/);
  assert.match(completed, /StrCmpS \$FBForgeV2Complete 1 0 denied/);
  assert.match(completed, /StrCmpS \$FBForgeGuardReleased 1 0 denied/);
  assert.match(completed, /Call FBForgePollV2[\s\S]*"v2:released" 0 denied/);
  assert.match(body(text, 'CreateOrUpdateDesktopShortcut'), /\$FBForgeShortcutsFinalized = 1[\s\S]*Return/);
});

test('the configured template and fixed native identity stay paired to pinned CLI', async () => {
  const config = JSON.parse(await readFile(new URL('../desktop/tauri.conf.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const upstream = JSON.parse(await read('upstream.json'));
  const guard = await read('guard.nsh');
  assert.equal(pkg.devDependencies['@tauri-apps/cli'], upstream.version);
  assert.equal(config.bundle.windows.nsis.template, 'installer/installer.nsi');
  assert.ok(guard.includes(`!define FBFORGE_GUARD_APP_ID "${config.identifier}"`));
});
