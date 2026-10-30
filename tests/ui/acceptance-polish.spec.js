import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const button = (page, name) => page.getByRole('button', { name, exact: true });
for (const api of ['v2', 'v3']) {
  test(`existing destinations loads the list and returns from detail (${api})`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/destination-manager.html?api=${api}`);
    await button(page, 'Bestehende Destinations').click();
    await expect(page.getByRole('table')).toBeVisible();
    await button(page, 'Ansehen').first().click();
    await expect(page.getByRole('heading', { name: 'Onlinedienst Nord', exact: true })).toBeVisible();
    await button(page, 'Bestehende Destinations').click();
    await expect(page.getByRole('table')).toBeVisible();
    expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
  });
  test(`single original and technical downloads use native save, report cancel/errors, retain proof (${api})`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
    await page.evaluate(() => {
      window.isTauri = true;
      window.__savedFiles = [];
      window.__saveResult = 'C:\\Users\\Test\\Downloads\\Nachweis.pdf';
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args, options) => {
        if (command === 'save_local_file') {
          window.__savedFiles.push({ bytes: Array.from(args), name: options.headers['x-fbforge-file-name'] });
          if (window.__saveResult === 'fail') throw 'export_failed';
          return window.__saveResult;
        }
        return original(command, args, options);
      };
    });
    await button(page, 'Inhalte entschlüsseln und prüfen').click();
    await button(page, 'Original herunterladen').first().click();
    await expect(page.locator('.save-feedback')).toContainText('Datei gespeichert:');
    expect(await page.evaluate(() => window.__savedFiles[0].bytes.length)).toBeGreaterThan(0);
    await page.getByText(/Technische Inhalte und Originaldownloads/).click();
    await page.evaluate(() => (window.__saveResult = null));
    await button(page, 'Herunterladen').first().click();
    await expect(page.locator('.save-feedback')).toContainText('Speichern abgebrochen');
    expect(await page.evaluate(() => window.__applicationFixture.activities.at(-1).status)).toBe(
      'Abgebrochen',
    );
    await page.evaluate(() => (window.__saveResult = 'fail'));
    await button(page, 'Herunterladen').first().click();
    await expect(page.locator('.save-feedback [role=alert]')).toContainText('Schreibrechte');
    expect(await page.evaluate(() => window.__applicationFixture.activities.at(-1).status)).toBe(
      'Fehlgeschlagen',
    );
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    await expect(button(page, 'Annehmen')).toBeEnabled();
  });
}
test('signature updates stay visible and cancellable after leaving and returning without blocking test tools', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html');
  await button(page, 'Virenscan').click();
  await page.getByRole('combobox', { name: 'Verfahren', exact: true }).selectOption('local');
  await page.evaluate(() => {
    Object.assign(window.__integration.local, {
      installed: true,
      enabled: true,
      ready: true,
      databaseVersion: 28168,
      databaseCreatedAt: 1793255040,
      databaseAgeDays: 0,
    });
    window.__integration.holdLocalInstall = true;
  });
  await expect(button(page, 'Signaturen aktualisieren')).toBeVisible();
  await button(page, 'Signaturen aktualisieren').click();
  await expect(
    page.getByRole('progressbar', { name: 'Scanner-Aktionsfortschritt', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__integration.isBusy())).toBe(false);
  await button(page, 'Werkzeuge').click();
  await button(page, 'Fiktives Testpaket öffnen').click();
  await expect(page.locator('#test-case-choice')).toBeEnabled();
  await button(page, 'Virenscan').click();
  await expect(
    page.getByText('Signaturdatenbanken werden geprüft und aktualisiert …', { exact: true }),
  ).toBeVisible();
  await button(page, 'Vorgang abbrechen').click();
  await expect(page.getByRole('alert')).toContainText('abgebrochen');
  await expect(button(page, 'Signaturen aktualisieren')).toBeEnabled();
  expect(await page.evaluate(() => window.__integration.isBusy())).toBe(false);
});
for (const [width, theme] of [
  [1180, 'light'],
  [420, 'dark'],
]) {
  test(`form controls have room, visible labels and readable scanner choices at ${width}px ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const selector of ['#channel-description', '#channel-statuses']) {
      const field = page.locator(selector);
      const geometry = await field.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.parentElement.getBoundingClientRect();
        return { width: r.width, parent: p.width, height: r.height, labelTop: p.top, top: r.top };
      });
      expect(geometry.width).toBeGreaterThan(200);
      expect(geometry.width).toBeGreaterThan(geometry.parent * 0.9);
      expect(geometry.height).toBeGreaterThan(80);
      expect(geometry.top - geometry.labelTop).toBeGreaterThan(20);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html');
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await button(page, 'Virenscan').click();
    const select = page.getByRole('combobox', { name: 'Verfahren', exact: true });
    for (const value of ['off', 'local', 'clamav', 'icap']) {
      await select.selectOption(value);
      expect(
        await select.evaluate((el) => {
          const s = getComputedStyle(el),
            c = document.createElement('canvas').getContext('2d');
          c.font = s.font;
          return (
            c.measureText(el.selectedOptions[0].textContent.trim()).width +
              parseFloat(s.paddingLeft) +
              parseFloat(s.paddingRight) <=
            el.clientWidth
          );
        }),
      ).toBe(true);
    }
    expect(
      await select.evaluate((el) => {
        const s = getComputedStyle(el);
        const light = (color) => {
          const c = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => v / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
          return c.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        };
        const a = light(s.borderTopColor),
          b = light(s.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }),
    ).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
test('missing release metadata is actionable and its long message wraps', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/updates.html');
  await page.evaluate(() => (window.__updateFixture.fail = 'update_feed_unavailable'));
  await button(page, 'Nach Updates suchen').click();
  await expect(page.getByRole('alert')).toContainText('noch keine Informationen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(button(page, 'Installieren und neu starten')).toHaveCount(0);
});

for (const api of ['v2', 'v3']) {
  test(`verified event details show problems and attachment authentication tags inline, page by page (${api})`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/event-overview.html?api=${api}`);
    const rows = page.locator('.event-log-entry');
    await expect(rows).toHaveCount(20);
    await expect(rows.first().locator('.event-payload')).toContainText('synthetic-tag-0');
    await expect(rows.first().locator('.event-payload')).toContainText(
      'Falsches Metadatenschema 0 <img src=x>',
    );
    await expect(rows.first().locator('.event-payload')).toContainText('Betroffene Ressource');
    expect(await rows.locator('.event-payload details').count()).toBe(0);
    expect(await rows.locator('.event-payload img').count()).toBe(0);
    await expect(button(page, 'Nächste Seite')).toBeEnabled();
    expect(
      await page.evaluate(
        () => window.__eventOverview.calls.filter((c) => c.command === 'read_event_log').length,
      ),
    ).toBe(20);
    await button(page, 'Nächste Seite').click();
    await expect(rows).toHaveCount(5);
    await expect(rows.last().locator('.event-payload')).toContainText('synthetic-tag-24');
    await expect(button(page, 'Vorherige Seite')).toBeEnabled();
    expect(
      await page.evaluate(
        () => window.__eventOverview.calls.filter((c) => c.command === 'read_event_log').length,
      ),
    ).toBe(25);
    await button(page, 'JWS-Header').first().click();
    await expect(page.getByRole('dialog')).toContainText('PS512');
    await button(page, 'Vorschau schließen').click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('the full application keeps navigation and scanner cancellation available during signature updates', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/');
  await expect(page.getByRole('heading', { name: 'Start', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__scannerLocal = {
      installed: true,
      ready: true,
      enabled: true,
      automaticUpdates: false,
      engineVersion: '1.5.4',
      databaseVersion: 28168,
      databaseCreatedAt: 1793255040,
      databaseAgeDays: 0,
      lastUpdate: null,
      updateFailed: false,
      busy: false,
      operation: '',
      error: null,
      downloadedBytes: 0,
      downloadTotalBytes: 225774978,
    };
    window.__TAURI_INTERNALS__ = {
      async invoke(command) {
        if (command === 'local_scanner_status') return { ...window.__scannerLocal };
        if (command === 'update_local_scanner_database') {
          window.__scannerLocal.busy = true;
          window.__scannerLocal.operation = 'updating-database';
          return new Promise(
            (resolve, reject) => (window.__stopScannerUpdate = () => reject('content_cancelled')),
          );
        }
        if (command === 'cancel_local_scanner_operation') {
          Object.assign(window.__scannerLocal, { busy: false, operation: '', error: 'content_cancelled' });
          window.__stopScannerUpdate?.();
          return;
        }
        if (command === 'list_profiles') return [];
        throw 'session_missing';
      },
    };
  });
  await button(page, 'Virenscan').click();
  await expect(button(page, 'Signaturen aktualisieren')).toBeVisible();
  await button(page, 'Signaturen aktualisieren').click();
  await expect(button(page, 'Scanner-Aktion abbrechen')).toBeVisible();
  for (const section of ['Senden', 'Empfangen', 'Testwerkzeuge']) {
    await button(page, section).click();
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeFocused();
    await expect(button(page, 'Scanner-Aktion abbrechen')).toBeEnabled();
  }
  await button(page, 'Fiktives Testpaket öffnen').click();
  await expect(page.locator('#test-case-choice')).toBeEnabled();
  await button(page, 'Scanner-Aktion abbrechen').click();
  await button(page, 'Virenscan').click();
  await expect(page.getByRole('alert')).toContainText('abgebrochen');
  await expect(button(page, 'Signaturen aktualisieren')).toBeEnabled();
});

for (const api of ['v2', 'v3']) {
  test(`outgoing scanner feedback waits for native preparation and names every checked attachment (${api})`, async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
    if (api === 'v2') await button(page, 'API wechseln').click();
    else await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
    await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
    await button(page, 'Leistungen laden').click();
    await button(page, 'Weiter: Fachdaten').click();
    await button(page, 'Weiter: Anlagen & Antwortkanal').click();
    await page.locator('#send-attachments').setInputFiles({
      name: 'Geprüfte Testanlage.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Fiktive Testanlage'),
    });
    await page.evaluate(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__scanSendWrites = 0;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'execute_send') window.__scanSendWrites++;
        const result = await original(command, args);
        if (command === 'prepare_send') {
          result.data.scanStatus = 'passed';
          await new Promise((resolve) => (window.__releasePreparedScan = resolve));
        }
        return result;
      };
    });
    await button(page, 'Versand vorbereiten').click();
    await expect(page.getByRole('status').filter({ hasText: 'Scan-Ergebnis' })).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
    ).toBeHidden();
    await page.evaluate(() => window.__releasePreparedScan());
    const result = page.getByRole('region', { name: 'Virenscan dieser Nachricht', exact: true });
    await expect(result).toContainText('Virenscan abgeschlossen');
    await expect(result).toContainText('Geprüfte Testanlage.txt');
    await expect(result).toContainText('Geprüft · kein Fund');
    expect(await page.evaluate(() => window.__scanSendWrites)).toBe(0);
  });
}
