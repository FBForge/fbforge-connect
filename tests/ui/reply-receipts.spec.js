import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('reply-receipts with synthetic native fixtures', async ({ browser }) => {
  for (const action of ['accept', 'reject', 'uncertain', 'stale']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:1420/test-fixtures/reply-receipt.html');
    if (action === 'reject') {
      await page.locator('#reply-receipt-action').selectOption('reject');
      await page.locator('#reply-receipt-description').fill('Synthetischer Ablehnungsgrund');
    }
    if (action === 'uncertain') await page.evaluate(() => (window.__receiptFixture.uncertain = true));
    if (action === 'stale') {
      await page.evaluate(() => (window.__receiptFixture.delay = true));
      await page.getByRole('button', { name: 'Aktion vorbereiten', exact: true }).click();
      await page.waitForFunction(() => window.__receiptFixture.release);
      await page.evaluate(() => {
        window.__receiptFixture.invalidate();
        window.__receiptFixture.release();
      });
      await page.waitForFunction(() => window.__receiptFixture.cancels === 1);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.evaluate(() => window.__receiptFixture.writes), 0);
      await page.close();
      continue;
    }
    await page.getByRole('button', { name: 'Aktion vorbereiten', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(() => window.__receiptFixture.writes), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__receiptFixture.writes), 0);
    await page.getByRole('button', { name: 'Aktion vorbereiten', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page
      .getByRole('button', { name: action === 'reject' ? 'Jetzt ablehnen' : 'Jetzt annehmen', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Ergebnis der Antwortquittierung' }).waitFor();
    assert.equal(await page.evaluate(() => window.__receiptFixture.writes), 1);
    assert.equal(await page.getByRole('button', { name: 'Aktion vorbereiten', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Event Log der Antwort prüfen', exact: true }).click();
    await page.getByText('Event Log verifiziert', { exact: true }).waitFor();
    assert.equal(await page.locator('#event-kind').inputValue(), 'reply');
    await page.locator('#event-kind').selectOption('case');
    await page.getByRole('button', { name: 'Event Log prüfen', exact: true }).click();
    await page.getByText('Event Log verifiziert', { exact: true }).waitFor();
    assert.equal(await page.locator('.event-log-entry').count(), 1);
    assert.equal(await page.evaluate(() => window.__receiptFixture.writes), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Reply receipt UI passed: explicit prepare/cancel/confirm, accept/reject, uncertain lock, stale-proof cleanup, reply/case log navigation.',
  );
});
