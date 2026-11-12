import { destinationConfiguration } from './destination-extras.js';
import { validOffers } from './destination-offers.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function noPrivate(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(
    ([key, item]) =>
      ![
        'privateJwk',
        'privateKey',
        'clientSecret',
        'secret',
        'access_token',
        'd',
        'p',
        'q',
        'dp',
        'dq',
        'qi',
        'oth',
        'k',
      ].includes(key) && noPrivate(item),
  );
}
export function backupSummary(value) {
  const fields = [
    'id',
    'name',
    'environment',
    'sourceDestinationId',
    'capturedAt',
    'destinationName',
    'type',
    'privateKeyCount',
    'registeredKeyCount',
    'missingKeys',
    'complete',
    'canReuseKeys',
    'callbackSecretMissing',
  ];
  if (
    !object(value) ||
    Object.keys(value).sort().join() !== fields.sort().join() ||
    !uuid(value.id) ||
    !uuid(value.sourceDestinationId) ||
    !['TEST', 'STAGE', 'PROD'].includes(value.environment) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 160 ||
    !(
      value.destinationName === null ||
      (typeof value.destinationName === 'string' && value.destinationName.length <= 512)
    ) ||
    !['A', 'B', 'C'].includes(value.type) ||
    !Number.isSafeInteger(value.capturedAt) ||
    value.capturedAt <= 0 ||
    ['privateKeyCount', 'registeredKeyCount'].some(
      (k) => !Number.isInteger(value[k]) || value[k] < 0 || value[k] > 128,
    ) ||
    ['complete', 'canReuseKeys', 'callbackSecretMissing'].some((k) => typeof value[k] !== 'boolean') ||
    !Array.isArray(value.missingKeys) ||
    value.missingKeys.length > 128 ||
    value.missingKeys.some((k) => typeof k !== 'string' || k.length > 512) ||
    value.complete !== (value.missingKeys.length === 0) ||
    value.privateKeyCount + value.missingKeys.length !== value.registeredKeyCount
  )
    throw new Error('engine_protocol_error');
  return structuredClone(value);
}
export async function destinationBackups(invoke, session, action) {
  if (!session?.connected || session.apiVersion !== 'v3') throw new Error('session_missing');
  const result = await invoke('destination_backups', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    action,
  });
  if (!noPrivate(result)) throw new Error('engine_protocol_error');
  switch (action.action) {
    case 'list':
      if (
        !object(result) ||
        Object.keys(result).join() !== 'items' ||
        !Array.isArray(result.items) ||
        result.items.length > 20
      )
        throw new Error('engine_protocol_error');
      return result.items.map(backupSummary);
    case 'capture':
    case 'import':
      return result === null && action.action === 'import' ? null : backupSummary(result);
    case 'inspect':
      if (
        !object(result) ||
        Object.keys(result).sort().join() !== 'configuration,snapshot,summary' ||
        !object(result.configuration) ||
        !object(result.snapshot) ||
        result.snapshot.destinationId !== result.summary?.sourceDestinationId
      )
        throw new Error('engine_protocol_error');
      return {
        summary: backupSummary(result.summary),
        configuration: structuredClone(result.configuration),
        snapshot: structuredClone(result.snapshot),
      };
    case 'use_keys':
      if (!object(result) || Object.keys(result).join() !== 'bundleId' || !uuid(result.bundleId))
        throw new Error('engine_protocol_error');
      break;
    case 'restore_keys':
      if (
        !object(result) ||
        !uuid(result.destinationId) ||
        !Number.isInteger(result.restored) ||
        result.restored < 1 ||
        result.restored > 128
      )
        throw new Error('engine_protocol_error');
      break;
    case 'export':
      if (!object(result) || typeof result.saved !== 'boolean') throw new Error('engine_protocol_error');
      break;
    case 'delete':
      if (!object(result) || result.deleted !== true) throw new Error('engine_protocol_error');
      break;
    default:
      throw new Error('invalid_input');
  }
  return result;
}
export function backupChanges(configuration) {
  if (
    !destinationConfiguration(configuration) ||
    !validOffers({
      publicServices: configuration.publicServices,
      processMessages: configuration.processMessages,
    })
  )
    throw new Error('backup_invalid');
  const changes = structuredClone(configuration);
  delete changes.type;
  if (configuration.type === 'C') {
    delete changes.publicServices;
    delete changes.processMessages;
  }
  return changes;
}
