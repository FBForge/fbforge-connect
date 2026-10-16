import { chmod, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Tauri overwrites resource copies, so generated jlink files must remain owner-writable. */
export async function makeGeneratedFilesWritable(directory) {
  const info = await lstat(directory);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    for (const entry of await readdir(directory)) await makeGeneratedFilesWritable(join(directory, entry));
  } else if (info.isFile()) {
    await chmod(directory, info.mode | 0o200);
  }
}
