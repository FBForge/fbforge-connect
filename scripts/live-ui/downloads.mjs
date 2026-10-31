import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, cleanEnvironment, until } from './desktop.mjs';
import { errorMessage } from '../../frontend/src/diagnostics.js';

export async function nativeFolder(
  desktop,
  fixture,
  operation,
  cancel = false,
  schemaReview = false,
  fileOptions = null,
) {
  const folder = join(fixture.directory, 'desktop-ui', 'exports');
  await mkdir(folder, { recursive: true });
  const helper = spawn(
    join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('./select-export-folder.ps1', import.meta.url)),
      '-ApplicationId',
      String(desktop.app.pid),
      '-Folder',
      folder,
      ...(cancel ? ['-Cancel'] : []),
      ...(fileOptions
        ? ['-SaveFile', '-FileName', fileOptions.name, '-DialogTitle', fileOptions.title || 'Datei speichern']
        : []),
      ...(schemaReview === true || schemaReview === 'schema' ? ['-SchemaReview'] : []),
      ...(schemaReview === 'attachment' ? ['-AttachmentReview'] : []),
      ...(schemaReview === 'scanner' ? ['-ScannerReview'] : []),
      ...(schemaReview === 'scanner-update' ? ['-ScannerUpdate'] : []),
    ],
    { env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'ignore'] },
  );
  let diagnostic = '';
  helper.stdout.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (/^ui_[a-z_]+$/.test(line)) diagnostic = line;
      if (/^ui_(?:folder|file)_diagnostic [a-z_]+=(?:[0-9]+|true|false)$/.test(line)) console.error(line);
    }
  });
  const completed = new Promise((resolve, reject) => {
    helper.on('error', () => reject(new Error('live_ui_folder_helper_unavailable')));
    helper.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(diagnostic ? `live_ui_${diagnostic}` : 'live_ui_native_folder_failed')),
    );
  });
  try {
    await Promise.all([completed, operation()]);
  } catch (error) {
    const alerts = await desktop.page
      .locator('.message-download [role="alert"],.message-batch-dialog[open] [role="alert"]')
      .allTextContents()
      .catch(() => []);
    const known = [
      'engine_busy',
      'engine_protocol_error',
      'session_missing',
      'export_failed',
      'export_expired',
      'authentication_failed',
      'resource_denied',
      'invalid_resource',
      'vault_pending',
      'verification_failed',
    ];
    const codes = known.filter((code) => alerts.some((text) => text.trim() === errorMessage(code)));
    console.error(
      `Real desktop export diagnostics: alerts=${alerts.length}; known_codes=${codes.join(',') || 'none'}`,
    );
    throw error;
  } finally {
    if (helper.exitCode === null) helper.kill();
  }
  return folder;
}

async function filesBelow(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files;
}
export async function verifyDownload(folder, message, reply = false) {
  const all = await filesBelow(folder);
  const manifestFiles = all.filter((path) => path.endsWith('export.json'));
  let found = false;
  for (const path of manifestFiles) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (manifest.messageId === (reply ? message.replyId : message.submissionId)) {
      const directory = join(path, '..');
      const parts = await readdir(directory);
      check(
        parts.includes('metadata.json') &&
          parts.includes('data.json') &&
          !parts.includes('UNVOLLSTAENDIG.txt'),
        'live_ui_export_parts_missing',
      );
      check(JSON.parse(await readFile(join(directory, 'data.json'), 'utf8')), 'live_ui_export_data_invalid');
      if (!reply)
        check(
          (await readFile(join(directory, 'data.json'), 'utf8')) === message.text,
          'live_ui_export_data_changed',
        );
      check(manifest.environment === 'TEST', 'live_ui_export_environment_wrong');
      if (!reply) {
        const attachment = manifest.files.find(
          (file) => file.kind === 'attachment' && file.originalName === 'ui-test-attachment.txt',
        );
        check(
          attachment &&
            (await readFile(join(directory, attachment.file), 'utf8')) ===
              'Fiktive TEST-Anlage aus der installierten Oberfläche.',
          'live_ui_export_attachment_changed',
        );
        const pdf = manifest.files.find((file) => file.originalName === 'ui-fictional-attachment.pdf');
        check(
          pdf &&
            (await readFile(join(directory, pdf.file))).equals(
              await readFile(
                new URL('../../frontend/test-fixtures/assets/fictional-attachment.pdf', import.meta.url),
              ),
            ),
          'live_ui_export_pdf_changed',
        );
      }
      found = true;
    }
  }
  check(found, 'live_ui_export_manifest_missing');
  console.log(
    `Real desktop UI: ${reply ? 'reply' : 'submission'} metadata, data and export manifest saved through native folder picker`,
  );
}

export async function downloadMessage(desktop, fixture, message, reply = false) {
  const page = desktop.page;
  const download = page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true });
  // Cancelling the warning must not become an implicit export permission.
  await nativeFolder(desktop, fixture, () => download.click(), true);
  await download.waitFor({ state: 'visible' });
  const folder = await nativeFolder(desktop, fixture, () => download.click());
  await page
    .locator('.message-download')
    .getByRole('button', { name: 'Exportordner kopieren', exact: true })
    .waitFor();
  await verifyDownload(folder, message, reply);
}

export const nativeSchemaReview = (desktop, fixture, operation, cancel = false) =>
  nativeFolder(desktop, fixture, operation, cancel, true);

export const nativeAttachmentReview = (desktop, fixture, operation) =>
  nativeFolder(desktop, fixture, operation, false, 'attachment');

export const nativeScannerReview = (desktop, fixture, operation) =>
  nativeFolder(desktop, fixture, operation, false, 'scanner');

export async function nativeFile(
  desktop,
  fixture,
  operation,
  name,
  cancel = false,
  title = 'Datei speichern',
) {
  const folder = await nativeFolder(desktop, fixture, operation, cancel, false, { name, title });
  const path = join(folder, name);
  if (!cancel)
    await until(
      async () =>
        readFile(path)
          .then(() => true)
          .catch(() => false),
      'live_ui_native_saved_file_missing',
    );
  return path;
}

export const nativeSignatureUpdate = (desktop, fixture, operation) =>
  nativeFolder(desktop, fixture, operation, false, 'scanner-update');
