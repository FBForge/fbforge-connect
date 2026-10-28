// Internal acceptance only. No renderer mocks, tracing, screenshots or credential artifacts.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { mkdir, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { secretNames } from '../native-test-engine.mjs';

export const check = (value, code) => {
  if (!value) throw new Error(code);
};
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(operation, code, milliseconds = 45000) {
  const deadline = Date.now() + milliseconds;
  do {
    const result = await operation();
    if (result) return result;
    await pause(300);
  } while (Date.now() < deadline);
  throw new Error(code);
}
export const cleanEnvironment = () => {
  const env = { ...process.env };
  for (const key of [
    ...secretNames,
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'ACTIONS_RUNTIME_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'JAVA_HOME',
    'JDK_HOME',
    'JAVA_TOOL_OPTIONS',
    '_JAVA_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'CLASSPATH',
    'DEBUG',
  ])
    delete env[key];
  env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  return env;
};
async function debuggerEndpoint(port) {
  for (const host of ['127.0.0.1', 'localhost']) {
    const result = await new Promise((resolve) => {
      const request = get(
        `http://${host}:${port}/json/version`,
        { agent: false, timeout: 1000 },
        (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += chunk;
            if (body.length > 65536) request.destroy();
          });
          response.on('error', () => resolve(null));
          response.on('end', () => {
            try {
              resolve(response.statusCode === 200 ? JSON.parse(body).webSocketDebuggerUrl : null);
            } catch {
              resolve(null);
            }
          });
        },
      );
      request.on('timeout', () => request.destroy());
      request.on('error', () => resolve(null));
    });
    if (typeof result !== 'string') continue;
    const url = new URL(result);
    check(
      url.protocol === 'ws:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        url.port === String(port) &&
        !url.username &&
        !url.password,
      'live_ui_debug_endpoint_untrusted',
    );
    return result;
  }
  return null;
}
export async function createDesktop(directory, profiles) {
  check(
    process.platform === 'win32' &&
      process.env.GITHUB_REPOSITORY === 'FBForge/fbforge-connect' &&
      process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      process.env.RUNNER_ENVIRONMENT === 'github-hosted',
    'live_ui_context_denied',
  );
  const appData = join(process.env.APPDATA, 'org.fitconnect.integration-client');
  const profileRoot = join(appData, 'profiles');
  try {
    await access(appData);
    throw new Error('live_ui_existing_app_data');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const install = join(directory, 'desktop-ui', 'application');
  let app,
    browser,
    launchFailed = false,
    policyPort,
    ownsData = false,
    installed = false;
  const close = async () => {
    let policyCleanupFailed = false;
    if (browser) {
      let timer;
      try {
        await Promise.race([
          browser.close().catch(() => {}),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (app?.pid && app.exitCode === null)
      spawnSync('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
    if (policyPort) {
      const removed = testPolicy('disable', policyPort);
      policyCleanupFailed = Boolean(removed.error || removed.status !== 0);
      if (!policyCleanupFailed) {
        policyPort = null;
        console.log('Real desktop UI: temporary WebView test configuration removed');
      }
    }
    if (installed)
      spawnSync(join(install, 'uninstall.exe'), ['/S', `_?=${install}`], {
        env: cleanEnvironment(),
        stdio: 'ignore',
        timeout: 120000,
      });
    if (ownsData) await rm(appData, { recursive: true, force: true });
    check(!policyCleanupFailed, 'live_ui_test_policy_cleanup_failed');
  };
  const testPolicy = (mode, port) =>
    spawnSync(
      join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        fileURLToPath(new URL('./webview-test-policy.ps1', import.meta.url)),
        '-Mode',
        mode,
        '-Directory',
        join(directory, 'desktop-ui'),
        '-Port',
        String(port),
      ],
      { env: cleanEnvironment(), stdio: 'ignore', timeout: 15000 },
    );
  try {
    await mkdir(join(directory, 'desktop-ui'), { recursive: true });
    const setup = spawnSync(process.env.FBFORGE_UI_INSTALLER, ['/S', `/D=${install}`], {
      env: cleanEnvironment(),
      stdio: 'ignore',
      timeout: 120000,
    });
    check(!setup.error && setup.status === 0, 'live_ui_install_failed');
    installed = true;
    ownsData = true;
    await mkdir(profileRoot, { recursive: true });
    for (const profile of profiles) {
      const input = Buffer.from(JSON.stringify(profile.document));
      try {
        const saved = spawnSync(profile.bridge, ['save', profileRoot, profile.id], {
          env: cleanEnvironment(),
          input,
          stdio: ['pipe', 'ignore', 'ignore'],
          timeout: 30000,
        });
        check(!saved.error && saved.status === 0, 'live_ui_profile_fixture_failed');
      } finally {
        input.fill(0);
      }
    }
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    policyPort = port;
    const configured = testPolicy('enable', port);
    check(!configured.error && configured.status === 0, 'live_ui_test_policy_setup_failed');
    console.log('Real desktop UI: per-application debugging configuration prepared for isolated hosted test');
    const env = cleanEnvironment();
    // The debugging endpoint exists only in this owned CI process, on loopback.
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
    env.WEBVIEW2_USER_DATA_FOLDER = join(directory, 'desktop-ui', 'webview-cache');
    app = spawn(join(install, 'fbforge-connect.exe'), [], { env, cwd: install, stdio: 'ignore' });
    app.once('error', () => {
      launchFailed = true;
    });
    let endpoint;
    try {
      endpoint = await until(async () => {
        if (launchFailed) throw new Error('live_ui_app_launch_failed');
        if (app.exitCode !== null) throw new Error('live_ui_app_exited');
        return debuggerEndpoint(port);
      }, 'live_ui_debug_endpoint_missing');
    } catch (error) {
      const diagnostic = spawnSync(
        join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          fileURLToPath(new URL('./inspect-startup.ps1', import.meta.url)),
          '-ApplicationId',
          String(app.pid),
          '-ExpectedPort',
          String(port),
        ],
        { env: cleanEnvironment(), encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      // The helper emits only fixed labels, booleans and counts, never command lines or text fields.
      for (const line of (diagnostic.stdout || '').split(/\r?\n/))
        if (/^desktop_bootstrap [a-z_]+=(?:true|false|[0-9]+)$/.test(line)) console.error(line);
      throw error;
    }
    browser = await chromium.connectOverCDP(endpoint, { timeout: 30000 });
    const page = await until(
      async () =>
        browser
          .contexts()[0]
          ?.pages()
          .find((p) => /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost)/.test(p.url())),
      'live_ui_page_missing',
    );
    page.setDefaultTimeout(45000);
    await page.locator('.desktop-shell').waitFor();
    check(
      await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke === 'function'),
      'live_ui_native_bridge_missing',
    );
    check(
      (await page.locator('.app-topbar .environment-tag').innerText()).trim() === 'TEST',
      'live_ui_wrong_environment',
    );
    check(
      (await page.locator('.app-topbar .build-tag').innerText()).trim() === process.env.FBFORGE_UI_VERSION,
      'live_ui_version_mismatch',
    );
    return { page, close, app };
  } catch (error) {
    await close();
    throw error;
  }
}
