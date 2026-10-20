import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('reply-workflow with synthetic native fixtures', async ({ browser }) => {
  for (const uncertain of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [],
      external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:1420/')) external.push(r.url());
    });
    await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
    await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
    await page.evaluate((u) => (window.__applicationFixture.uncertain = u), uncertain);
    await page.getByRole('heading', { name: 'Antrag lesen', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.__applicationFixture.calls.filter((command) => command === 'verify_submission').length,
      ),
      1,
    );
    await page.getByText('Fachliche Prüfung: manuell offen', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Antwortmöglichkeiten laden', exact: true }).click();
    const prepare = page.getByRole('button', { name: 'Antwort prüfen und vorbereiten', exact: true });
    assert.equal(await prepare.isDisabled(), true);
    await page.locator('#reply-schema-sources').check();
    await page.getByRole('button', { name: 'Antwortschema laden', exact: true }).click();
    await prepare.waitFor();
    await page.waitForFunction(() => window.__applicationFixture.calls.includes('load_reply_schema'));
    await page.getByRole('button', { name: 'Fiktiven Antwortentwurf erzeugen', exact: true }).click();
    await page.getByRole('button', { name: 'Beispieldaten übernehmen', exact: true }).click();
    await page.getByText(/Fiktiver Antwortentwurf erzeugt/).waitFor();
    assert.equal(JSON.parse(await page.locator('#reply-data').inputValue()).status, 'erhalten');
    await page.locator('#reply-data').fill('{"status":"falsch"}');
    await prepare.click();
    await page.getByRole('alert').filter({ hasText: 'entspricht nicht' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.__applicationFixture.replyWrites), 0);
    const valid = '{\n "status":"erhalten"\n}';
    await page.locator('#reply-data').fill(valid);
    await page.getByRole('button', { name: 'Fachdaten visuell ansehen', exact: true }).click();
    await page.locator('.draft-inline-preview').getByText('erhalten', { exact: true }).waitFor();
    await page
      .locator('.draft-inline-preview')
      .locator('.application-field-label')
      .filter({ hasText: 'Bearbeitungsstatus' })
      .waitFor();
    await page.getByRole('button', { name: 'Inhalt bearbeiten', exact: true }).click();
    assert.equal(await page.locator('#reply-data').inputValue(), valid);
    await prepare.click();
    await page.getByRole('dialog', { name: 'Antwort an TEST senden?', exact: true }).waitFor();
    await page.getByText('Antwortschema geprüft', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__applicationFixture.replyWrites), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__applicationFixture.replyWrites), 0);
    await prepare.click();
    await page.getByRole('button', { name: 'Antwort jetzt senden', exact: true }).click();
    await page
      .getByRole('heading', {
        name: uncertain ? 'Reply-Versandausgang ungewiss' : 'Antwort an TEST übergeben',
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.__applicationFixture.replyWrites), 1);
    assert.equal(
      await page.evaluate(() => new TextDecoder().decode(window.__applicationFixture.replyBytes)),
      valid,
    );
    assert.equal(await page.evaluate(() => window.__applicationFixture.uploaded.size), 0);
    if (uncertain) assert.equal(await prepare.isDisabled(), true);
    await page.getByRole('button', { name: 'Event Log der Antwort prüfen', exact: true }).click();
    await page.getByText('Antwort übermittelt', { exact: true }).waitFor();
    await page.getByText('Antwort angenommen', { exact: true }).waitFor();
    await page.getByText('Event Log verifiziert', { exact: true }).waitFor();
    assert.equal(await page.locator('#event-kind').inputValue(), 'reply');
    assert.equal(await page.locator('#event-destination').count(), 0);
    assert.equal(await page.evaluate(() => window.__applicationFixture.replyWrites), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await page.close();
  }
  console.log(
    'Reply workflow passed: verified application, schema labels, invalid-data block, unchanged bytes, explicit confirmation/cancel, one write, staging cleanup, uncertain lock and reply event-log navigation.',
  );
});
