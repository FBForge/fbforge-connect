// Production output regression: development-server tests cannot detect chunk execution errors.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, extname } from 'node:path';
import { build } from 'vite';
import { chromium, expect } from '@playwright/test';

test(
  'production chunks stay within budget and execute navigation, licenses, schemas and BPMN',
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'connect-bundle-'));
    let browser, server;
    try {
      const output = await build({
        configFile: resolve('frontend/vite.config.js'),
        build: { outDir: directory, emptyOutDir: true },
      });
      const chunks = output.output.filter((item) => item.type === 'chunk');
      assert.ok(chunks.length > 1);
      for (const chunk of chunks) {
        assert.ok(
          Buffer.byteLength(chunk.code) <= 500000,
          `${chunk.fileName} exceeds Vite's default 500 kB warning threshold`,
        );
        assert.ok(chunk.fileName.length < 100, `Chunk filename is too long for Windows: ${chunk.fileName}`);
      }
      const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      };
      server = createServer(async (request, response) => {
        try {
          const path = resolve(
            directory,
            '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname),
          );
          if (path !== directory && !path.startsWith(directory + sep)) throw new Error('outside test root');
          const filename = path === directory ? join(directory, 'index.html') : path;
          const bytes = await readFile(filename);
          response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' });
          response.end(bytes);
        } catch {
          response.writeHead(404);
          response.end();
        }
      });
      await new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(0, '127.0.0.1', done);
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch(
        process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox'] }
          : {},
      );
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [],
        missing = [],
        external = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) missing.push(response.url());
      });
      await page.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          external.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(origin);
      await expect(page.getByRole('heading', { name: 'Start', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Info', exact: true }).click();
      await page.getByRole('button', { name: 'Lizenztext anzeigen', exact: true }).click();
      await expect(page.locator('dialog[open]')).toContainText('European Union Public Licence');
      await page
        .locator('dialog[open]')
        .getByRole('button', { name: 'Lizenztext schließen', exact: true })
        .click();
      await page.getByRole('button', { name: 'Drittanbieter-Lizenzen anzeigen', exact: true }).click();
      await expect(page.locator('dialog[open]')).toContainText('Apache License');
      await expect(page.locator('dialog[open]')).not.toContainText('Lizenztexte werden geladen.');
      await page.locator('dialog[open]').getByRole('button', { name: 'Schließen', exact: true }).click();
      await page.getByRole('button', { name: 'Testwerkzeuge', exact: true }).click();
      await page.getByRole('button', { name: 'Antwortschemas', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Antwortschema erstellen', exact: true })).toBeVisible();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSON-Schema herunterladen', exact: true }).click();
      const schema = JSON.parse(await readFile(await (await download).path(), 'utf8'));
      assert.equal(schema.$id, 'urn:fbforge:connect:reply:status:1');
      await page.getByRole('button', { name: 'Prozesse', exact: true }).click();
      await page.getByRole('button', { name: 'Fiktiven Demo-Prozess öffnen', exact: true }).click();
      await expect(page.locator('.bpmn-diagram .djs-container > svg')).toBeVisible();
      await expect(page.locator('.bpmn-message-list button')).toHaveCount(4);
      assert.deepEqual(errors, [], 'production chunks must initialize without browser errors');
      assert.deepEqual(missing, [], 'all split production resources must resolve');
      assert.deepEqual(external, [], 'these offline workflows must not contact external services');
    } finally {
      await browser?.close();
      if (server) {
        server.closeAllConnections();
        await new Promise((done) => server.close(done));
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
