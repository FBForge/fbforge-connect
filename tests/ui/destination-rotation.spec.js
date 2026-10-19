import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('destination-rotation with synthetic native fixtures', async ({ browser }) => {
  for (const uncertain of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:1420/test-fixtures/destination-rotation.html');
    await page.evaluate((value) => (window.__rotationFixture.uncertain = value), uncertain);
    await page
      .getByRole('button', { name: 'Neue Schlüssel vorbereiten und Vorschau zeigen', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Zur Bestätigung', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__rotationFixture.generated), 2);
    assert.equal(await page.evaluate(() => window.__rotationFixture.writes), 0);
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await page.getByRole('heading', { name: 'Zur Bestätigung', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__rotationFixture.cancelled), 1);
    await page
      .getByRole('button', { name: 'Neue Schlüssel vorbereiten und Vorschau zeigen', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Zur Bestätigung', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__rotationFixture.generated), 2);
    await page
      .getByRole('button', { name: 'Schlüssel dieser Destinations auf TEST wechseln', exact: true })
      .click();
    if (uncertain) {
      await page.getByRole('heading', { name: 'Ergebnis ungewiss', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Letztes Ergebnis abrufen', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__rotationFixture.writes), 1);
      await page.evaluate(() => (window.__rotationFixture.uncertain = false));
      await page
        .getByRole('button', { name: 'Registrierung prüfen und Fortsetzung vorbereiten', exact: true })
        .click();
      await page.getByRole('heading', { name: 'Zur Bestätigung', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__rotationFixture.generated), 2);
      await page
        .getByRole('button', { name: 'Schlüssel dieser Destinations auf TEST wechseln', exact: true })
        .click();
    }
    await page.getByRole('heading', { name: 'Abgeschlossen', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Neue Schlüssel laden und zum Empfang', exact: true })
      .first()
      .click();
    await page.waitForFunction(() => window.__rotationFixture.receive);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Bulk key rotation UI passed: independent keys, read-only preview, cancel/reuse, one confirmation, uncertain read-only result and explicit resume, receive navigation.',
  );
});
