import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactServiceName, leikaCode, lookupServiceName } from '../frontend/src/service-names.js';
test('FIM names require an exact LeiKa match and an unambiguous usable title', () => {
  const code = '99134061002000';
  assert.equal(leikaCode(`urn:de:fim:leika:leistung:${code}`), code);
  assert.equal(leikaCode('https://localhost/99134061002000'), null);
  assert.equal(leikaCode('urn:test:99134061002000'), null);
  const row = { leistungsschluessel: code, title: 'Fiktive Verwaltungsleistung' };
  assert.equal(exactServiceName({ items: [{ ...row, leistungsschluessel: '99000000000000' }] }, code), null);
  assert.equal(exactServiceName({ result: 'error', error: { code: 404 } }, code), null);
  assert.equal(exactServiceName({ items: [row, { ...row, title: 'Abweichender Titel' }] }, code), null);
  assert.equal(exactServiceName({ items: [row] }, code), row.title);
});
test('lookup uses only the fixed public endpoint, sends no credentials and bounds/caches responses', async () => {
  const code = '99134061002001',
    title = 'Fiktiver Katalogtitel';
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, 'https://fimportal.de');
    assert.equal(new URL(url).pathname, '/api/v1/leistung-steckbriefe');
    assert.equal(new URL(url).searchParams.get('fts_query'), code);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    return Response.json({ items: [{ leistungsschluessel: code, title }] });
  };
  const id = `urn:de:fim:leika:leistung:${code}`;
  assert.equal(await lookupServiceName(id, undefined, fetcher), title);
  assert.equal(await lookupServiceName(id, undefined, fetcher), title);
  assert.equal(calls, 1);
  assert.equal(await lookupServiceName('urn:test:unknown', undefined, fetcher), null);
  const other = 'urn:de:fim:leika:leistung:99134061002002';
  await assert.rejects(
    lookupServiceName(other, undefined, async () => new Response('<html/>')),
    /service_names_unavailable/,
  );
  await assert.rejects(
    lookupServiceName(
      other,
      undefined,
      async () =>
        new Response('x'.repeat(256 * 1024 + 1), { headers: { 'content-type': 'application/json' } }),
    ),
    /service_names_unavailable/,
  );
  await assert.rejects(
    lookupServiceName(other, undefined, async () => Response.json({}, { status: 404 })),
    /service_names_unavailable/,
  );
});
