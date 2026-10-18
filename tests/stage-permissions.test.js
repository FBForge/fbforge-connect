import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeGeneratedFilesWritable } from '../scripts/stage-permissions.mjs';

test(
  'generated resource files become owner-writable while execute and other permission bits stay intact',
  { skip: process.platform === 'win32' ? 'POSIX file modes are not available on Windows' : false },
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'fit-stage-permissions-'));
    try {
      const runtime = join(fixture, 'runtime');
      const nested = join(runtime, 'legal', 'java.base');
      await mkdir(nested, { recursive: true });
      const license = join(nested, 'LICENSE');
      const executable = join(runtime, 'java');
      await writeFile(license, 'synthetic license');
      await writeFile(executable, 'synthetic executable');
      await chmod(license, 0o444);
      await chmod(executable, 0o555);
      await makeGeneratedFilesWritable(runtime);
      assert.equal((await lstat(license)).mode & 0o777, 0o644);
      assert.equal((await lstat(executable)).mode & 0o777, 0o755);
      await writeFile(license, 'overwrite succeeds');
      await makeGeneratedFilesWritable(runtime);
      assert.equal((await lstat(executable)).mode & 0o777, 0o755);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

test(
  'generated resource permission normalization never follows file, directory or root symlinks',
  {
    skip:
      process.platform === 'win32'
        ? 'POSIX symlink creation may require elevated privileges on Windows'
        : false,
  },
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'fit-stage-symlink-'));
    try {
      const runtime = join(fixture, 'runtime');
      const outside = join(fixture, 'outside-runtime');
      await mkdir(runtime);
      await mkdir(outside);
      const file = join(outside, 'untouched');
      await writeFile(file, 'outside generated tree');
      await chmod(file, 0o444);
      await symlink(file, join(runtime, 'file-link'));
      await symlink(outside, join(runtime, 'directory-link'));
      const rootLink = join(fixture, 'root-link');
      await symlink(outside, rootLink);
      await makeGeneratedFilesWritable(runtime);
      await makeGeneratedFilesWritable(rootLink);
      assert.equal((await lstat(file)).mode & 0o777, 0o444);
      assert.equal((await lstat(join(runtime, 'directory-link'))).isSymbolicLink(), true);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
