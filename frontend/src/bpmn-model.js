import { BpmnModdle } from 'bpmn-moddle';

export const BPMN_LIMIT = 2 * 1024 * 1024;
export const FIT_BPMN_NAMESPACE = 'urn:fit-connect:test-client:bpmn:1';
const text = (value, max = 1024) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\x00-\x1f\x7f]/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));
const invalid = () => {
  throw new Error('bpmn_invalid');
};
const schema = (uri, mime) =>
  (uri === null && mime === null) ||
  (text(uri, 4096) &&
    /^(https:\/\/|urn:)/.test(uri) &&
    ['application/json', 'application/xml'].includes(mime));
export async function parseBpmnModel(xml) {
  if (typeof xml !== 'string' || !xml.trim() || new TextEncoder().encode(xml).length > BPMN_LIMIT)
    throw new Error('bpmn_limit');
  // No DTD/entities, active content, remote resources, or processing instructions other than XML declaration.
  if (
    /<!\s*(?:DOCTYPE|ENTITY)|<\?\s*(?!xml(?:\s|\?>))|<\s*(?:[\w.-]+:)?(?:script|iframe|image|img|foreignObject)\b|(?:\b(?:href|src)\s*=)/i.test(
      xml,
    ) ||
    (xml.match(/</g) || []).length > 30000
  )
    invalid();
  let parsed;
  try {
    parsed = await new BpmnModdle().fromXML(xml);
  } catch {
    invalid();
  }
  const root = parsed.rootElement,
    elements = [],
    seen = new Set(),
    pending = [root];
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const current = pending[cursor];
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (current.$type) elements.push(current);
    if (seen.size > 20000) throw new Error('bpmn_limit');
    for (const [key, value] of Object.entries(current))
      if (!key.startsWith('$') && value && typeof value === 'object')
        pending.push(...(Array.isArray(value) ? value : [value]));
  }
  if (
    root?.$type !== 'bpmn:Definitions' ||
    parsed.warnings.length ||
    elements.length > 10000 ||
    (root.id !== undefined && !text(root.id, 1024))
  )
    invalid();
  if (
    elements.filter((element) => ['bpmndi:BPMNShape', 'bpmndi:BPMNEdge'].includes(element.$type)).length > 500
  )
    throw new Error('bpmn_limit');
  const prefixes = Object.entries(root.$attrs)
    .filter(([key, value]) => key.startsWith('xmlns:') && value === FIT_BPMN_NAMESPACE)
    .map(([key]) => key.slice(6));
  function attribute(element, name) {
    const values = prefixes
      .map((prefix) => {
        if (element.$attrs[`xmlns:${prefix}`] && element.$attrs[`xmlns:${prefix}`] !== FIT_BPMN_NAMESPACE)
          return undefined;
        return element.$attrs[`${prefix}:${name}`];
      })
      .filter((value) => value !== undefined);
    if (values.length > 1 && new Set(values).size > 1) invalid();
    return values[0] ?? null;
  }
  const defined = (root.rootElements || []).filter((element) => element.$type === 'bpmn:Message');
  if (defined.length > 500) throw new Error('bpmn_limit');
  const messages = defined.map((message) => {
    if (!text(message.id)) invalid();
    const processModelId = attribute(message, 'processModelId') ?? attribute(root, 'processModelId');
    const messageId = attribute(message, 'messageId');
    const schemaUri = attribute(message, 'schemaUri'),
      mimeType = attribute(message, 'mimeType');
    if (
      (processModelId !== null && !text(processModelId)) ||
      (messageId !== null && !text(messageId)) ||
      !schema(schemaUri, mimeType)
    )
      invalid();
    return {
      bpmnMessageId: message.id,
      name: message.name || message.id,
      processModelId,
      messageId,
      schemaUri,
      mimeType,
    };
  });
  const byId = new Map(messages.map((message) => [message.bpmnMessageId, message]));
  const selections = [];
  for (const element of elements) {
    if (!element.messageRef) continue;
    const message = byId.get(element.messageRef.id);
    if (!message) invalid();
    const selected = element.$type === 'bpmn:MessageEventDefinition' ? element.$parent : element;
    let direction =
      element.$type === 'bpmn:SendTask'
        ? 'send'
        : element.$type === 'bpmn:ReceiveTask'
          ? 'receive'
          : element.$type === 'bpmn:MessageFlow'
            ? 'flow'
            : /ThrowEvent|EndEvent/.test(selected.$type)
              ? 'send'
              : /CatchEvent|StartEvent/.test(selected.$type)
                ? 'receive'
                : 'unknown';
    selections.push({
      elementId: selected.id,
      bpmnType: selected.$type,
      label: selected.name || message.name,
      bpmnMessageId: message.bpmnMessageId,
      direction,
      sourceId: element.sourceRef?.id ?? null,
      targetId: element.targetRef?.id ?? null,
    });
  }
  if (selections.length > 1000) throw new Error('bpmn_limit');
  for (const message of messages)
    if (!selections.some((item) => item.bpmnMessageId === message.bpmnMessageId))
      selections.push({
        elementId: message.bpmnMessageId,
        bpmnType: 'bpmn:Message',
        label: message.name,
        bpmnMessageId: message.bpmnMessageId,
        direction: 'unknown',
        sourceId: null,
        targetId: null,
      });
  if (new Set(selections.map((item) => item.elementId)).size !== selections.length) invalid();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
  return {
    sha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(''),
    definitionId: root.id ?? null,
    name: root.name || root.id || 'BPMN-Modell',
    messages,
    selections,
    hasDiagram: Boolean(root.diagrams?.length),
  };
}
export function mappingDocument(model, entries) {
  const value = { format: 'fit-connect-bpmn-mapping', version: 1, sha256: model.sha256, entries };
  return checkedMapping(model, value);
}
export function checkedMapping(model, value) {
  if (
    !exact(value, ['format', 'version', 'sha256', 'entries']) ||
    value.format !== 'fit-connect-bpmn-mapping' ||
    value.version !== 1 ||
    value.sha256 !== model.sha256 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 500
  )
    throw new Error('bpmn_mapping_mismatch');
  const ids = new Set(),
    matches = new Set();
  const entries = value.entries.map((row) => {
    if (
      !exact(row, ['bpmnMessageId', 'processModelId', 'messageId', 'schemaUri', 'mimeType']) ||
      !model.messages.some((message) => message.bpmnMessageId === row.bpmnMessageId) ||
      ids.has(row.bpmnMessageId) ||
      !text(row.processModelId) ||
      !text(row.messageId) ||
      !schema(row.schemaUri, row.mimeType)
    )
      throw new Error('bpmn_mapping_mismatch');
    const identity = `${row.processModelId}\n${row.messageId}`;
    if (matches.has(identity)) throw new Error('bpmn_mapping_ambiguous');
    ids.add(row.bpmnMessageId);
    matches.add(identity);
    return Object.freeze({ ...row });
  });
  return Object.freeze({ ...value, entries: Object.freeze(entries) });
}
export function initialMapping(model) {
  return mappingDocument(
    model,
    model.messages
      .filter((row) => row.processModelId && row.messageId)
      .map(({ bpmnMessageId, processModelId, messageId, schemaUri, mimeType }) => ({
        bpmnMessageId,
        processModelId,
        messageId,
        schemaUri,
        mimeType,
      })),
  );
}
export function processHighlights(model, mapping, context) {
  if (!context?.processModelId || !context?.messageId) return [];
  const verified = checkedMapping(model, mapping);
  const match = verified.entries.find(
    (row) => row.processModelId === context.processModelId && row.messageId === context.messageId,
  );
  return match
    ? model.selections.filter((row) => row.bpmnMessageId === match.bpmnMessageId).map((row) => row.elementId)
    : [];
}
