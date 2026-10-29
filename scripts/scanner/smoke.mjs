// Actual engine acceptance with the standard EICAR test string, never real malware.
// Test bytes remain in memory and are streamed to our own temporary ClamD process.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, createConnection } from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { startIcapTestService } from './icap-test-service.mjs';
import { fileURLToPath } from 'node:url';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error('scanner_smoke_argument_missing');
  return resolve(process.argv[i + 1]);
};
const engine = arg('--engine-directory'),
  database = arg('--database-directory'),
  certificates = arg('--certificates-directory');
const workspace = await mkdtemp(join(tmpdir(), 'fbforge-clamav-smoke-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const executable = join(engine, process.platform === 'win32' ? 'clamd.exe' : 'clamd');
const quote = (path) => {
  if (/[\r\n"]/.test(path)) throw new Error('scanner_smoke_path_invalid');
  return `"${path}"`;
};
await writeFile(
  join(workspace, 'clamd.conf'),
  `Foreground yes\nTCPAddr 127.0.0.1\nTCPSocket ${port}\nDatabaseDirectory ${quote(database)}\nCVDCertsDirectory ${quote(certificates)}\nTemporaryDirectory ${quote(workspace)}\nMaxThreads 2\nMaxScanTime 15000\nMaxFileSize 32M\nMaxScanSize 64M\nStreamMaxLength 32M\nAlertExceedsMax yes\nAlertEncrypted yes\n`,
);
const child = spawn(executable, ['--config-file', join(workspace, 'clamd.conf')], {
  cwd: engine,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let failed = false,
  output = '';
child.on('error', () => {
  failed = true;
});
for (const pipe of [child.stdout, child.stderr])
  pipe?.on('data', (chunk) => {
    if (output.length < 16384) output += chunk.toString('utf8');
  });
async function request(bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let response = '';
    socket.setTimeout(20000, () => socket.destroy(new Error('scanner_smoke_timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.end(bytes));
    socket.on('data', (chunk) => {
      response += chunk.toString('ascii');
      if (response.length > 4096) socket.destroy(new Error('scanner_smoke_response_limit'));
      if (response.includes('\0')) {
        socket.destroy();
        resolve(response.split('\0')[0]);
      }
    });
    socket.on('end', () => {
      if (!response.includes('\0')) reject(new Error('scanner_smoke_incomplete'));
    });
  });
}
function stream(bytes) {
  const chunks = [Buffer.from('zINSTREAM\0')];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    const chunk = bytes.subarray(offset, offset + 8192),
      length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    chunks.push(length, chunk);
  }
  chunks.push(Buffer.alloc(4));
  return Buffer.concat(chunks);
}
try {
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline && !failed && child.exitCode === null) {
    try {
      if ((await request(Buffer.from('zPING\0'))) === 'PONG') {
        ready = true;
        break;
      }
    } catch {
      /* The owned daemon may still be loading its database. */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('scanner_smoke_not_ready');
  const eicar = Buffer.from(
    [
      'X5O',
      '!P%@AP',
      '[4',
      String.fromCharCode(92),
      'PZX54(P^)7CC)7}',
      '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!',
      '$H+H*',
    ].join(''),
    'ascii',
  );
  if (createHash('md5').update(eicar).digest('hex') !== '44d88612fea8a8f36de82e1278abb02f')
    throw new Error('scanner_smoke_fixture_invalid');
  for (const bytes of [
    Buffer.from('Fiktive saubere Integrations-Testdatei.'),
    await readFile(new URL('../../frontend/test-fixtures/assets/fictional-attachment.pdf', import.meta.url)),
  ])
    if ((await request(stream(bytes))) !== 'stream: OK') throw new Error('scanner_smoke_clean_rejected');
  const infected = await request(stream(eicar));
  if (!infected.endsWith(' FOUND') || !infected.toLowerCase().includes('eicar'))
    throw new Error('scanner_smoke_eicar_not_detected');
  console.log('Real ClamAV: clean text/PDF accepted and standard EICAR detected via INSTREAM.');
  if (process.argv.includes('--java-acceptance')) {
    const icap = await startIcapTestService((bytes) => request(stream(bytes)));
    try {
      const nativeArguments = [
        '-f',
        'engine/pom.xml',
        '--batch-mode',
        '-Dtest=RealScannerAcceptance',
        '-Dsurefire.failIfNoSpecifiedTests=false',
        'test',
      ];
      const command =
        process.platform === 'win32' ? process.env.ComSpec || 'C:/Windows/System32/cmd.exe' : './engine/mvnw';
      const args =
        process.platform === 'win32'
          ? [
              '/d',
              '/s',
              '/c',
              '.\\engine\\mvnw.cmd -f engine/pom.xml --batch-mode -Dtest=RealScannerAcceptance -Dsurefire.failIfNoSpecifiedTests=false test',
            ]
          : [
              ...nativeArguments,
              ...(process.env.FBFC_SCANNER_MAVEN_SETTINGS
                ? ['-s', process.env.FBFC_SCANNER_MAVEN_SETTINGS]
                : []),
              ...(process.env.FBFC_SCANNER_MAVEN_REPOSITORY
                ? ['-Dmaven.repo.local=' + process.env.FBFC_SCANNER_MAVEN_REPOSITORY]
                : []),
            ];
      const acceptance = spawn(command, args, {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        env: {
          ...process.env,
          FBFC_SCANNER_CLAMD_PORT: String(port),
          FBFC_SCANNER_ICAP_PORT: String(icap.port),
        },
        stdio: 'inherit',
        windowsHide: true,
      });
      const code = await new Promise((resolve, reject) => {
        acceptance.once('error', reject);
        acceptance.once('exit', resolve);
      });
      if (code !== 0) throw new Error('scanner_smoke_host_acceptance_failed');
      console.log(
        'Real Java host: clean/blocked attachment isolation and outbound EICAR rejection passed through ClamAV and ICAP.',
      );
    } finally {
      await icap.close();
    }
  }
} catch (error) {
  // Source-controlled diagnostic only; no raw scanner output or test payload.
  console.error(/^scanner_smoke_[a-z_]+$/.test(error.message) ? error.message : 'scanner_smoke_failed');
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  await rm(workspace, { recursive: true, force: true });
}
