import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('destination-setup with synthetic native fixtures', async ({ browser }) => {
  for (const scenario of ['confirmed', 'uncertain', 'profile-required', 'type-c']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:1420/test-fixtures/destination-setup.html');
    await page.locator('#setup-name').fill('Bauamt TEST');
    await page.locator('#setup-organisation').fill('Teststadt');
    await page.locator('#setup-email').fill('test@example.invalid');
    await page.locator('#setup-address').fill('Musterstrasse 1, 12345 Musterstadt');
    await page.locator('#setup-phone').fill('+49 30 000000');
    if (scenario === 'type-c') await page.locator('#setup-type').selectOption('C');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    if (scenario !== 'type-c') {
      await page.locator('#setup-schema').fill('urn:test:application');
      await page.locator('#setup-reply-schema').fill('urn:test:reply');
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    if (scenario === 'profile-required')
      await page.evaluate(() => (window.__creationFixture.profileMissing = true));
    if (scenario === 'uncertain') await page.evaluate(() => (window.__creationFixture.uncertain = true));
    await page.getByRole('button', { name: 'Zustellpunkt vorbereiten', exact: true }).click();
    if (scenario === 'profile-required') {
      await page.getByRole('alert').filter({ hasText: 'gespeicherten Windows-Profil' }).waitFor();
      assert.equal(await page.evaluate(() => window.__creationFixture.writes), 0);
      assert.equal(await page.locator('#setup-name').inputValue(), 'Bauamt TEST');
      assert.deepEqual(errors, []);
      await page.close();
      continue;
    }
    await page.getByRole('dialog', { name: 'Diesen Zustellpunkt in TEST anlegen?', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__creationFixture.writes), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__creationFixture.writes), 0);
    await page.getByRole('button', { name: 'Zustellpunkt vorbereiten', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page.evaluate(() => window.__creationFixture.generated),
      scenario === 'type-c' ? 0 : 1,
    );
    await page.getByRole('button', { name: 'Zustellpunkt jetzt auf TEST anlegen', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__creationFixture.writes), 1);
    if (scenario === 'uncertain') {
      await page.getByRole('heading', { name: 'Anlageausgang ungeklärt', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Zustellpunkt vorbereiten', exact: true }).count(),
        0,
      );
      await page
        .getByRole('button', { name: 'Vorhandenen Zustellpunkt prüfen und zuordnen', exact: true })
        .click();
      await page
        .getByRole('heading', {
          name:
            scenario === 'type-c'
              ? 'Zustellpunktangaben geprüft'
              : 'Zustellpunkt und Schlüsselzuordnung geprüft',
          exact: true,
        })
        .waitFor();
      assert.equal(await page.evaluate(() => window.__creationFixture.reconciles), 1);
      assert.equal(await page.evaluate(() => window.__creationFixture.writes), 1);
    } else
      await page
        .getByRole('heading', {
          name:
            scenario === 'type-c'
              ? 'Zustellpunktangaben geprüft'
              : 'Zustellpunkt und Schlüsselzuordnung geprüft',
          exact: true,
        })
        .waitFor();
    await page
      .getByRole('button', { name: 'Zustellpunkt ansehen und Aktivierung vorbereiten', exact: true })
      .click();
    assert.ok(await page.evaluate(() => window.__creationFixture.created));
    assert.equal(await page.evaluate(() => window.__creationFixture.writes), 1);
    if (scenario !== 'type-c') {
      await page
        .getByRole('button', { name: 'Schlüssel laden und zum Empfang wechseln', exact: true })
        .click();
      await page.waitForFunction(() => window.__creationFixture.receive);
    } else {
      assert.equal(
        await page
          .getByRole('button', { name: 'Schlüssel laden und zum Empfang wechseln', exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.evaluate(() => window.__creationFixture.calls.includes('generate_test_keys')),
        false,
      );
    }
    assert.equal(await page.evaluate(() => window.__creationFixture.writes), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Destination setup UI passed: guided steps, required profile, immutable preview, cancel/reuse of keys, one confirmed create, read-only reconciliation and key/activation navigation.',
  );
});
