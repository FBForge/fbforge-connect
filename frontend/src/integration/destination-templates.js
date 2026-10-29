import { validOffers } from '../destination-offers.js';
export function validateTemplate(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== 'changes,format,name,version' ||
    value.format !== 'fbforge-connect-destination-template' ||
    value.version !== 1 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 160 ||
    /[\x00-\x1f]/.test(value.name)
  )
    throw new Error('invalid_input');
  const changes = value.changes;
  const allowed = [
    'name',
    'status',
    'contactInformation',
    'metadataVersions',
    'publicServices',
    'processMessages',
  ];
  if (
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).some((key) => !allowed.includes(key)) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 24 * 1024
  )
    throw new Error('invalid_input');
  const text = (v, max) =>
    typeof v === 'string' && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
  if (Object.hasOwn(changes, 'name') && (!text(changes.name, 256) || !changes.name.trim()))
    throw new Error('invalid_input');
  if (Object.hasOwn(changes, 'status') && !['active', 'inactive'].includes(changes.status))
    throw new Error('invalid_input');
  if (
    Object.hasOwn(changes, 'metadataVersions') &&
    (!Array.isArray(changes.metadataVersions) ||
      !changes.metadataVersions.length ||
      changes.metadataVersions.length > 16 ||
      new Set(changes.metadataVersions).size !== changes.metadataVersions.length ||
      changes.metadataVersions.some((v) => typeof v !== 'string' || !/^[123]\.\d{1,3}\.\d{1,3}$/.test(v)))
  )
    throw new Error('invalid_input');
  if (
    Object.hasOwn(changes, 'contactInformation') &&
    (!changes.contactInformation ||
      typeof changes.contactInformation !== 'object' ||
      Array.isArray(changes.contactInformation) ||
      !Object.keys(changes.contactInformation).length ||
      Object.entries(changes.contactInformation).some(
        ([k, v]) =>
          !['legalName', 'address', 'phone', 'email', 'unit'].includes(k) ||
          !(v === null || text(v, k === 'address' ? 2048 : 256)),
      ))
  )
    throw new Error('invalid_input');
  if (
    !validOffers({
      publicServices: changes.publicServices ?? [],
      processMessages: changes.processMessages ?? [],
    })
  )
    throw new Error('invalid_input');
  return JSON.parse(JSON.stringify(value));
}
export function configurationDifferences(before, after) {
  const a = before || {},
    b = after || {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .flatMap((field) =>
      JSON.stringify(a[field]) === JSON.stringify(b[field])
        ? []
        : [{ field, before: a[field] ?? null, after: b[field] ?? null }],
    );
}
export async function profileWorkspace(invoke, session, request = { action: 'read' }) {
  if (!session?.connected) throw new Error('session_missing');
  const result = await invoke('profile_workspace', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    request,
  });
  if (result === null) return null;
  if (
    !result ||
    !Array.isArray(result.templates) ||
    result.templates.length > 20 ||
    !Array.isArray(result.history) ||
    result.history.length > 100 ||
    !Array.isArray(result.favorites) ||
    !Array.isArray(result.recent)
  )
    throw new Error('engine_protocol_error');
  return result;
}
