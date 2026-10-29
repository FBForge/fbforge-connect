import { validateTestPack } from '../test-packs.js';
import { parseLocalXml } from '../safe-xml.js';
import { nodes as jsonNodes } from '../json-viewer.js';
export const flowSteps = Object.freeze({
  send: 'Einreichung senden',
  receive: 'Eingang prüfen',
  compare: 'Inhalte vergleichen',
  receipt: 'Empfangsbestätigung prüfen',
  reply: 'Antwort senden',
  check_reply: 'Antwort prüfen',
});
const stepsFor = (item) => [
  'send',
  'receive',
  'compare',
  ...(item.receipt !== 'none' ? ['receipt'] : []),
  ...(item.reply ? ['reply', 'check_reply'] : []),
];
const fail = () => {
  throw new Error('test_flow_invalid');
};
export function validateTestFlow(value) {
  if (
    !value ||
    Object.keys(value).sort().join() !== 'format,name,pack,steps,version' ||
    value.format !== 'fbforge-connect-testflow' ||
    value.version !== 1 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 160 ||
    /[\x00-\x1f]/.test(value.name)
  )
    fail();
  validateTestPack(value.pack);
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 120) fail();
  const states = new Map();
  for (const step of value.steps) {
    if (!step || Object.keys(step).sort().join() !== 'caseId,type' || !Object.hasOwn(flowSteps, step.type))
      fail();
    const item = value.pack.cases.find((item) => item.id === step.caseId);
    if (!item) fail();
    const state = states.get(step.caseId) || [];
    const next = stepsFor(item)[state.length];
    if (step.type !== next) fail();
    state.push(step.type);
    states.set(step.caseId, state);
  }
  for (const [id, types] of states)
    if (types.length !== stepsFor(value.pack.cases.find((item) => item.id === id)).length) fail();
  return structuredClone(value);
}
export function flowFromPack(pack, name = pack.name) {
  validateTestPack(pack);
  return validateTestFlow({
    format: 'fbforge-connect-testflow',
    version: 1,
    name,
    pack,
    steps: pack.cases.flatMap((item) =>
      stepsFor(item).map((type) => ({
        caseId: item.id,
        type,
      })),
    ),
  });
}
// JSON property order is irrelevant; values and array order are exact. XML is compared exactly,
// after safe parsing, so mixed text/element order can never produce a false positive.
function canonicalJson(text) {
  JSON.parse(text);
  const nodes = jsonNodes(text);
  // Above the display parser limits, exact source equality remains a conservative comparison.
  if (!nodes) return ['source', text];
  const children = new Map();
  for (const node of nodes) {
    const list = children.get(node.parent) || [];
    list.push(node);
    children.set(node.parent, list);
  }
  function visit(node) {
    if (!node.branch) return [node.type, node.type === 'string' ? JSON.parse(node.value) : node.value];
    const nested = children.get(node.id) || [];
    if (node.array) return ['array', nested.map(visit)];
    if (new Set(nested.map((child) => child.label)).size !== nested.length) fail();
    return [
      'object',
      nested
        .map((child) => [child.label, visit(child)])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    ];
  }
  return visit(nodes[0]);
}
export function compareTestContent(actual, expected, mimeType) {
  if (
    typeof actual !== 'string' ||
    typeof expected !== 'string' ||
    new TextEncoder().encode(actual).length > 512 * 1024
  )
    return false;
  try {
    if (mimeType === 'application/json')
      return JSON.stringify(canonicalJson(actual)) === JSON.stringify(canonicalJson(expected));
    if (mimeType === 'application/xml') {
      parseLocalXml(actual, 512 * 1024);
      parseLocalXml(expected, 512 * 1024);
      return actual === expected;
    }
  } catch {
    return false;
  }
  return false;
}
export function eligibleFlowRecord(record, step, startedAt, binding = {}) {
  if (
    record.available === false ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    Date.parse(record.createdAt) < startedAt ||
    !['sent', 'verified', 'accepted', 'rejected', 'confirmed'].includes(record.status)
  )
    return false;
  const reply = ['reply', 'check_reply'].includes(step.type),
    received = ['receive', 'compare', 'receipt', 'check_reply'].includes(step.type);
  return (
    record.kind === (reply ? 'reply' : 'submission') &&
    record.direction === (received ? 'received' : 'sent') &&
    (!binding.caseId || record.caseId === binding.caseId) &&
    (reply || !binding.submissionId || record.submissionId === binding.submissionId) &&
    (!reply || !binding.replyId || record.replyId === binding.replyId)
  );
}
