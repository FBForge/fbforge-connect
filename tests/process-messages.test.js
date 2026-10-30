import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addProcessReply, mappedMessages } from '../frontend/src/process-messages.js';
test('process replies preserve exact identities, prevent duplicates and enforce schema hints and limits', () => {
  const row = {
    processModelId: ' urn:test:process ',
    messageId: ' request-more ',
    schemaUri: 'urn:test:reply',
    mimeType: 'application/json',
  };
  const added = addProcessReply([], row, 'urn:test:reply', 'application/json');
  assert.deepEqual(added, [{ processModelId: 'urn:test:process', messageId: 'request-more' }]);
  assert.throws(
    () => addProcessReply(added, row, 'urn:test:reply', 'application/json'),
    /process_message_duplicate/,
  );
  for (const [uri, mime] of [
    ['urn:test:other', 'application/json'],
    ['urn:test:reply', 'application/xml'],
  ])
    assert.throws(() => addProcessReply([], row, uri, mime), /process_schema_mismatch/);
  assert.throws(
    () =>
      addProcessReply(
        Array.from({ length: 16 }, (_, n) => ({ processModelId: 'x', messageId: `m${n}` })),
        row,
        'urn:test:reply',
        'application/json',
      ),
    /process_message_limit/,
  );
  for (const messageId of ['', 'a\nb', 'x'.repeat(1025), 123, null])
    assert.throws(
      () => addProcessReply([], { processModelId: 'valid', messageId }, 'x', 'application/json'),
      /process_message_invalid/,
    );
});
test('catalog contains committed model mappings and labels, with no session or authority data', () => {
  assert.deepEqual(mappedMessages(null, null), []);
  assert.deepEqual(
    mappedMessages(
      { messages: [{ bpmnMessageId: 'b', name: 'Nachforderung' }] },
      {
        entries: [
          { bpmnMessageId: 'b', processModelId: 'p', messageId: 'm', schemaUri: null, mimeType: null },
        ],
      },
    ),
    [
      {
        bpmnMessageId: 'b',
        processModelId: 'p',
        messageId: 'm',
        schemaUri: null,
        mimeType: null,
        label: 'Nachforderung',
      },
    ],
  );
});
test('catalog preserves model order after a mapping is edited and appended', () => {
  const model = {
    messages: [
      { bpmnMessageId: 'a', name: 'First' },
      { bpmnMessageId: 'b', name: 'Second' },
    ],
  };
  const entries = [
    { bpmnMessageId: 'b', messageId: 'second' },
    { bpmnMessageId: 'a', messageId: 'edited-first' },
  ];
  assert.deepEqual(
    mappedMessages(model, { entries }).map((row) => row.messageId),
    ['edited-first', 'second'],
  );
});
