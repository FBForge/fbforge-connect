// Bootstrap diagnosis before any credentials are entered or TEST resources created.
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createDesktop, check } from './desktop.mjs';
const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'fbforge-ui-probe-'));
let desktop;
try {
  check(Boolean(process.env.FBFORGE_UI_INSTALLER), 'live_ui_validated_installer_required');
  desktop = await createDesktop(directory, []);
  console.log('Validated installed desktop UI bootstrap passed without credentials or TEST writes');
} catch (error) {
  console.error(/^live_ui_[a-z_]+$/.test(error.message || '') ? error.message : 'live_ui_bootstrap_failed');
  process.exitCode = 1;
} finally {
  await desktop?.close();
  await rm(directory, { recursive: true, force: true });
}
