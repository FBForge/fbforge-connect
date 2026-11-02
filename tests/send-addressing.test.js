import test from 'node:test';
import assert from 'node:assert/strict';
import { effect, stop } from 'vue';
import { useSendAddressing } from '../frontend/src/send/useSendAddressing.ts';

const schema = (name, mimeType = 'application/json') => ({ schemaUri: `urn:test:${name}`, mimeType });
const offer = () => ({
  services: [
    {
      identifier: 'one',
      name: 'First',
      regions: ['DE01'],
      schemas: [schema('one'), schema('xml', 'application/xml')],
      replySchemas: [schema('reply')],
    },
    { identifier: 'two', name: 'Second', regions: [], schemas: [], replySchemas: [] },
  ],
  processes: [
    { processModelId: 'model', messageId: 'first', schemas: [schema('process')] },
    { processModelId: 'other', messageId: 'second', schemas: [] },
  ],
});
function selected() {
  const state = useSendAddressing();
  state.target.value = 'destination';
  state.recipient.value = offer();
  state.service.value = 'one';
  return state;
}
test('FIM label updates stay reactive without replacing chosen schema or deliberate edits', () => {
  const state = selected();
  state.schemaChoice.value = 1;
  state.serviceName.value = 'Edited';
  state.offerReplies.value = true;
  const original = state.recipient.value;
  let label;
  const observer = effect(() => {
    label = state.recipient.value.services[0].name;
  });
  try {
    state.applyServiceNames({ one: 'FIM title' });
    assert.equal(label, 'FIM title');
    assert.equal(original.services[0].name, 'First');
    assert.equal(state.serviceName.value, 'Edited');
    assert.equal(state.schemaChoice.value, 1);
    assert.equal(state.schema.value, 'urn:test:xml');
    assert.equal(state.offerReplies.value, true);
    state.serviceName.value = 'one';
    state.applyServiceNames({ one: 'Updated FIM title' });
    assert.equal(state.serviceName.value, 'Updated FIM title');
  } finally {
    stop(observer);
  }
});
test('service selection reconciles schema, region and reply defaults synchronously', () => {
  const state = selected();
  assert.equal(state.schema.value, 'urn:test:one');
  assert.equal(state.region.value, 'DE01');
  assert.equal(state.replySchema.value, 'urn:test:reply');
  state.schemaChoice.value = 1;
  assert.equal(state.mime.value, 'application/xml');
  state.offerReplies.value = true;
  state.offeredProcessMessages.value = [{ processModelId: 'model', messageId: 'reply' }];
  state.service.value = 'two';
  assert.equal(state.serviceName.value, 'Second');
  assert.equal(state.region.value, 'DE000000000000');
  assert.equal(state.schemaChoice.value, 0);
  assert.equal(state.schema.value, '');
  assert.equal(state.mime.value, 'application/json');
  assert.equal(state.offerReplies.value, false);
  assert.deepEqual(state.offeredProcessMessages.value, []);
  assert.equal(state.replySchema.value, '');
});
test('process selection and mode changes select only schemas of the active addressing mode', () => {
  const state = selected();
  state.addressing.value = 'process';
  assert.equal(state.schema.value, 'urn:test:process');
  assert.equal(state.modelId.value, 'model');
  state.service.value = 'two';
  assert.equal(state.schema.value, 'urn:test:process');
  state.processChoice.value = 1;
  assert.equal(state.modelId.value, 'other');
  assert.equal(state.messageId.value, 'second');
  assert.equal(state.schema.value, '');
  state.addressing.value = 'service';
  state.service.value = 'one';
  assert.equal(state.schema.value, 'urn:test:one');
});
test('changing destination clears stale recipient, schema, example and reply offers', () => {
  const state = selected();
  state.exampleNotice.value = 'generated';
  state.offerReplies.value = true;
  state.target.value = 'another';
  assert.equal(state.recipient.value, null);
  assert.equal(state.service.value, '');
  assert.equal(state.schema.value, '');
  assert.equal(state.exampleNotice.value, '');
  assert.equal(state.offerReplies.value, false);
  assert.deepEqual(state.replyOptions.value, []);
  state.applyServiceNames({ one: 'Late catalogue result' });
  assert.equal(state.recipient.value, null);
  assert.equal(state.serviceName.value, '');
});
test('session reset preserves target but invalidates API-specific offers and process mode', () => {
  const state = selected();
  state.addressing.value = 'process';
  state.resetSession('v3');
  assert.equal(state.target.value, 'destination');
  assert.equal(state.addressing.value, 'process');
  assert.equal(state.recipient.value, null);
  assert.equal(state.modelId.value, '');
  state.resetSession('v2');
  assert.equal(state.addressing.value, 'service');
});
test('reloading offers refreshes defaults without retaining a removed schema', () => {
  const state = selected();
  state.schemaChoice.value = 1;
  const next = offer();
  next.services[0].schemas = [schema('new')];
  state.recipient.value = next;
  assert.equal(state.schemaChoice.value, 0);
  assert.equal(state.schema.value, 'urn:test:new');
  assert.equal(state.mime.value, 'application/json');
});
test('unchanged selection keeps deliberate edits, changed reply identity invalidates process offers', () => {
  const state = selected();
  state.serviceName.value = 'Edited';
  state.offeredProcessMessages.value = [{ processModelId: 'model', messageId: 'reply' }];
  state.service.value = 'one';
  state.target.value = 'destination';
  state.replySchema.value = 'urn:test:reply';
  assert.equal(state.serviceName.value, 'Edited');
  assert.equal(state.offeredProcessMessages.value.length, 1);
  state.replySchema.value = 'urn:test:changed';
  assert.deepEqual(state.offeredProcessMessages.value, []);
  state.offeredProcessMessages.value = [{ processModelId: 'model', messageId: 'reply' }];
  state.replyMime.value = 'application/xml';
  assert.deepEqual(state.offeredProcessMessages.value, []);
});
