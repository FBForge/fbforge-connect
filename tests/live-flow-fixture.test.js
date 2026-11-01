import test from 'node:test';
import assert from 'node:assert/strict';
import { fixturePack } from '../scripts/live-ui/review-030.mjs';
import { flowFromPack } from '../frontend/src/integration/test-flows.js';
test('live workflow fixture exercises all six real round-trip stages including receipt and reply', async () => {
  const pack = await fixturePack({ runName: 'FBForge Connect CI fiktiver-testlauf' });
  assert.equal(pack.cases.length, 1);
  assert.equal(pack.cases[0].receipt, 'accept');
  assert.equal(JSON.parse(pack.cases[0].reply.data).status, 'eingegangen');
  assert.deepEqual(
    flowFromPack(pack).steps.map((step) => step.type),
    ['send', 'receive', 'compare', 'receipt', 'reply', 'check_reply'],
  );
  assert.equal(pack.cases[0].request.attachments.length, 2);
});
