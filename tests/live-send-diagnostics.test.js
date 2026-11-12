import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDiagnostics } from '../scripts/live-ui/send-diagnostics.mjs';
import { explain } from '../frontend/src/send/messages.js';

test('live send failure diagnostics retain known errors and HTTP status while excluding arbitrary UI and SDK text', async () => {
  const sensitive = 'synthetic-secret-body-and-customer-value';
  const root = {
    locator(selector) {
      if (selector === '.submission-result-table tbody tr')
        return {
          all: async () => [
            {
              locator: () => ({
                allTextContents: async () => [
                  sensitive,
                  sensitive,
                  '503',
                  `resource_unavailable\n${sensitive}`,
                ],
              }),
            },
          ],
        };
      return { allTextContents: async () => [sensitive, explain('network_timeout')] };
    },
    getByText: (text) => ({ isVisible: async () => text === 'Versandausgang ungewiss' }),
    getByRole: () => ({ isVisible: async () => false }),
  };
  const original = console.error,
    output = [];
  console.error = (value) => output.push(value);
  try {
    await sendDiagnostics({ locator: () => root });
  } finally {
    console.error = original;
  }
  assert.equal(output.length, 1);
  assert.ok(!output[0].includes(sensitive));
  const result = JSON.parse(output[0].slice(output[0].indexOf('{')));
  assert.deepEqual(result, {
    codes: ['network_timeout'],
    uncertain: true,
    failed: false,
    confirmationOpen: false,
    rows: [{ step: 'unknown', http: 503, code: 'resource_unavailable' }],
  });
});
