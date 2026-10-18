import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBpmnModel,
  initialMapping,
  mappingDocument,
  checkedMapping,
  processHighlights,
} from '../frontend/src/bpmn-model.js';
const xml = (attributes = '', message = '') =>
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:fc="urn:fit-connect:test-client:bpmn:1" id="definitions" targetNamespace="urn:demo" ${attributes}><bpmn:message id="message" name="Nachforderung" ${message}/><bpmn:process id="process"><bpmn:sendTask id="send" messageRef="message"/><bpmn:receiveTask id="receive" messageRef="message"/></bpmn:process></bpmn:definitions>`;
test('BPMN selection resolves message references without treating names or XML IDs as FIT identifiers', async () => {
  const model = await parseBpmnModel(xml());
  assert.equal(model.messages[0].messageId, null);
  assert.equal(model.messages[0].processModelId, null);
  assert.equal(initialMapping(model).entries.length, 0);
  assert.deepEqual(
    model.selections.map((row) => [row.elementId, row.direction, row.bpmnMessageId]),
    [
      ['send', 'send', 'message'],
      ['receive', 'receive', 'message'],
    ],
  );
  assert.match(model.sha256, /^[a-f0-9]{64}$/);
});
test('explicit namespace convention is separate from BPMN IDs; checksum binds saved/manual mapping', async () => {
  const model = await parseBpmnModel(
    xml(
      'fc:processModelId="urn:demo:process:1"',
      'fc:messageId="request-more" fc:schemaUri="urn:demo:data" fc:mimeType="application/json"',
    ),
  );
  const mapping = initialMapping(model);
  assert.equal(mapping.entries[0].messageId, 'request-more');
  assert.deepEqual(
    processHighlights(model, mapping, { processModelId: 'urn:demo:process:1', messageId: 'request-more' }),
    ['send', 'receive'],
  );
  assert.deepEqual(
    processHighlights(model, mapping, { processModelId: 'other', messageId: 'request-more' }),
    [],
  );
  const changed = await parseBpmnModel(xml('fc:processModelId="urn:demo:process:2"'));
  assert.throws(() => checkedMapping(changed, mapping), /bpmn_mapping_mismatch/);
  assert.throws(
    () => mappingDocument(model, [{ ...mapping.entries[0], bpmnMessageId: 'foreign' }]),
    /bpmn_mapping_mismatch/,
  );
  const wrongNamespace = await parseBpmnModel(
    xml('fc:processModelId="secret"', 'fc:messageId="wrong"').replace(
      'urn:fit-connect:test-client:bpmn:1',
      'urn:other',
    ),
  );
  assert.equal(initialMapping(wrongNamespace).entries.length, 0);
});
test('invalid XML, duplicate/unresolved IDs, DTD, active content and oversized models are blocked', async () => {
  for (const source of [
    'bad',
    xml().replace('id="receive"', 'id="send"'),
    xml().replaceAll('messageRef="message"', 'messageRef="missing"'),
    `<!DOCTYPE d [<!ENTITY e SYSTEM "file:///etc/passwd">]>${xml()}`,
    xml().replace('</bpmn:definitions>', '<script>alert(1)</script></bpmn:definitions>'),
    xml().replace('id="definitions"', 'id="definitions" href="https://example.invalid"'),
  ])
    await assert.rejects(parseBpmnModel(source), /bpmn_invalid/);
  await assert.rejects(parseBpmnModel('a'.repeat(2 * 1024 * 1024 + 1)), /bpmn_limit/);
});

test('message events without their own XML ID remain selectable through the enclosing event', async () => {
  const source = xml()
    .replace('id="definitions"', '')
    .replace(
      '<bpmn:sendTask id="send" messageRef="message"/>',
      '<bpmn:intermediateThrowEvent id="send"><bpmn:messageEventDefinition messageRef="message"/></bpmn:intermediateThrowEvent>',
    );
  const model = await parseBpmnModel(source);
  assert.equal(model.definitionId, null);
  assert.equal(model.selections.find((row) => row.elementId === 'send').direction, 'send');
});
