import { cp, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGeneratedFilesWritable } from './stage-permissions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const resources = join(root, 'desktop', 'resources');
const destination = join(resources, 'engine');
const jdk = process.env.JAVA_HOME;
if (!jdk) throw new Error('JAVA_HOME muss für die Paketierung auf ein JDK 25 zeigen.');
const release = await readFile(join(jdk, 'release'), 'utf8');
if (!/^JAVA_VERSION="25(?:[.\-"])/m.test(release))
  throw new Error('Die Paketierung benötigt ein JDK 25. JAVA_HOME prüfen.');
const executable = (name) => join(jdk, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
const artifacts = [
  ['host/target/engine-host.jar', 'engine-host.jar'],
  ['adapter-v2/target/adapter-v2.jar', 'adapters/adapter-v2.jar'],
  ['adapter-v3/target/adapter-v3.jar', 'adapters/adapter-v3.jar'],
];
for (const [source] of artifacts) {
  if (!(await stat(join(root, 'engine', source))).isFile())
    throw new Error('Zuerst den vollständigen Maven-Reaktor bauen.');
}
await mkdir(resources, { recursive: true });
const temporary = await mkdtemp(join(resources, '.stage-'));
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      executable('jlink'),
      [
        '--add-modules',
        'java.se,jdk.crypto.ec,jdk.unsupported,jdk.charsets',
        '--strip-debug',
        '--no-header-files',
        '--no-man-pages',
        '--output',
        join(temporary, 'runtime'),
      ],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('jlink ist fehlgeschlagen. JDK 25 und dessen Module prüfen.')),
    );
  });
  if (process.platform !== 'win32') await makeGeneratedFilesWritable(join(temporary, 'runtime'));
  await mkdir(join(temporary, 'adapters'));
  for (const [source, target] of artifacts) await cp(join(root, 'engine', source), join(temporary, target));
  await cp(join(root, 'LICENSE'), join(temporary, 'LICENSE'));
  try {
    await cp(join(root, 'THIRD_PARTY_NOTICES.md'), join(temporary, 'THIRD_PARTY_NOTICES.md'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await rm(destination, { recursive: true, force: true });
  await rename(temporary, destination);
  console.log('Java-Kern, beide SDK-Adapter und lokale Laufzeit sind bereitgestellt.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
