import { validateTestFlow } from './test-flows.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const fail = () => {
  throw new Error('engine_protocol_error');
};
function summary(value) {
  if (
    !value ||
    Object.keys(value).sort().join() !== 'caseCount,id,name,stepCount' ||
    !uuid(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 160 ||
    /[\x00-\x1f\x7f]/.test(value.name) ||
    !Number.isInteger(value.stepCount) ||
    value.stepCount < 1 ||
    value.stepCount > 120 ||
    !Number.isInteger(value.caseCount) ||
    value.caseCount < 1 ||
    value.caseCount > 20
  )
    fail();
  return value;
}
export async function listTestFlows(invoke) {
  const rows = await invoke('test_library', { request: { action: 'flow_list' } });
  if (!Array.isArray(rows) || rows.length > 32) fail();
  const entries = rows.map(summary);
  if (new Set(entries.map((row) => row.id)).size !== entries.length) fail();
  return entries;
}
export async function saveTestFlow(invoke, flow) {
  const document = validateTestFlow(flow),
    id = crypto.randomUUID();
  const saved = summary(
    await invoke('test_library', { request: { action: 'flow_save', id, flow: document } }),
  );
  if (
    saved.id !== id ||
    saved.name !== document.name ||
    saved.stepCount !== document.steps.length ||
    saved.caseCount !== document.pack.cases.length
  )
    fail();
  return saved;
}
export async function readTestFlow(invoke, id) {
  if (!uuid(id)) throw new Error('test_flow_invalid');
  return validateTestFlow(await invoke('test_library', { request: { action: 'flow_read', id } }));
}
export async function deleteTestFlow(invoke, id) {
  if (!uuid(id)) throw new Error('test_flow_invalid');
  if ((await invoke('test_library', { request: { action: 'flow_delete', id } })) !== null) fail();
}
