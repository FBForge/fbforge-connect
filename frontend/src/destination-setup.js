import { requestResource } from './resources.js';
import { uncertainOperationError } from './diagnostics.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const configFields = [
  'name',
  'type',
  'contactInformation',
  'metadataVersions',
  'publicServices',
  'processMessages',
];
function keyInfo(value, purpose) {
  if (
    !exact(value, ['kid', 'purpose', 'fingerprint', 'expiresAt']) ||
    value.purpose !== purpose ||
    !uuid(value.kid) ||
    typeof value.fingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    fail();
  return freeze({ ...value });
}
function bundle(value) {
  if (
    !exact(value, ['bundleId', 'destinationId', 'status', 'encryption', 'signing']) ||
    !uuid(value.bundleId) ||
    !['ready', 'reserved', 'unresolved', 'bound'].includes(value.status) ||
    (value.destinationId !== null && !uuid(value.destinationId)) ||
    (value.status === 'bound' && !value.destinationId) ||
    (value.status === 'ready' && value.destinationId !== null)
  )
    fail();
  return freeze({
    ...value,
    encryption: keyInfo(value.encryption, 'decrypt'),
    signing: keyInfo(value.signing, 'sign'),
  });
}
export async function generateTestKeys(invoke, session) {
  if (session?.apiVersion !== 'v3') throw new Error('invalid_input');
  const value = bundle(await requestResource(invoke, session, 'generate_test_keys'));
  if (value.status !== 'ready') fail();
  return value;
}
export async function listGeneratedKeys(invoke, session) {
  const value = await requestResource(invoke, session, 'list_generated_keys');
  if (!exact(value, ['bundles']) || !Array.isArray(value.bundles) || value.bundles.length > 64) fail();
  const rows = value.bundles.map(bundle),
    ids = new Set(rows.map((row) => row.bundleId));
  if (ids.size !== rows.length) fail();
  return Object.freeze(rows);
}
function publicConfiguration(document) {
  if (typeof document !== 'string' || new TextEncoder().encode(document).length > 44000) fail();
  let value;
  try {
    value = JSON.parse(document);
  } catch {
    fail();
  }
  if (
    !exact(value, [
      ...configFields,
      'status',
      'encryptionKid',
      'encryptionPublicKey',
      'signingPublicKey',
      'publicForRouting',
    ]) ||
    value.status !== 'created' ||
    value.publicForRouting !== false ||
    !['A', 'C'].includes(value.type) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !uuid(value.encryptionKid)
  )
    fail();
  for (const field of ['encryptionPublicKey', 'signingPublicKey']) {
    const key = value[field];
    if (
      !exact(key, ['kty', 'key_ops', 'alg', 'kid', 'n', 'e', 'x5c']) ||
      key.kty !== 'RSA' ||
      !uuid(key.kid) ||
      key.e !== 'AQAB' ||
      typeof key.n !== 'string' ||
      !/^[A-Za-z0-9_-]{683,1366}$/.test(key.n) ||
      !Array.isArray(key.key_ops) ||
      key.key_ops.length !== 1 ||
      !Array.isArray(key.x5c) ||
      key.x5c.length !== 1 ||
      typeof key.x5c[0] !== 'string' ||
      key.x5c[0].length > 24000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(key.x5c[0]) ||
      (field === 'encryptionPublicKey'
        ? key.alg !== 'RSA-OAEP-256' || key.key_ops[0] !== 'wrapKey'
        : key.alg !== 'PS512' || key.key_ops[0] !== 'verify')
    )
      fail();
  }
  return freeze(value);
}
function state(value, expected) {
  if (
    !exact(value, [
      'attemptId',
      'status',
      'bundleId',
      'configurationJson',
      'destinationId',
      'error',
      'httpStatus',
    ]) ||
    !['idle', 'prepared', 'running', 'confirmed', 'failed', 'uncertain', 'cancelled', 'expired'].includes(
      value.status,
    )
  )
    fail();
  if (value.status === 'idle') {
    if (
      ['attemptId', 'bundleId', 'configurationJson', 'destinationId', 'error', 'httpStatus'].some(
        (field) => value[field] !== null,
      )
    )
      fail();
  } else {
    if (
      (value.httpStatus !== null &&
        (!Number.isInteger(value.httpStatus) ||
          value.httpStatus < 100 ||
          value.httpStatus > 599 ||
          value.error === null)) ||
      !uuid(value.bundleId) ||
      (value.destinationId !== null && !uuid(value.destinationId)) ||
      (value.attemptId !== null && !uuid(value.attemptId)) ||
      (['failed', 'uncertain', 'expired'].includes(value.status)
        ? typeof value.error !== 'string' || !/^[a-z_]{1,64}$/.test(value.error)
        : value.error !== null) ||
      (value.status === 'confirmed' && value.destinationId === null)
    )
      fail();
    if (value.configurationJson !== null) publicConfiguration(value.configurationJson);
    else if (value.status !== 'confirmed' || value.attemptId !== null) fail();
    if (
      ['prepared', 'running'].includes(value.status) &&
      (value.attemptId === null || value.destinationId !== null)
    )
      fail();
  }
  if (
    expected &&
    ['attemptId', 'bundleId', 'configurationJson'].some((field) => value[field] !== expected[field])
  )
    fail();
  return freeze({ ...value });
}
// SDK offer arrays are sets. Normalize their order and optional null properties for comparison only.
function normalized(value) {
  if (Array.isArray(value))
    return value.map(normalized).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== null)
        .map((key) => [key, normalized(value[key])]),
    );
  return value;
}
export async function prepareDestinationCreation(invoke, session, selected, configuration) {
  if (
    session?.apiVersion !== 'v3' ||
    !uuid(selected?.bundleId) ||
    selected.status !== 'ready' ||
    !exact(configuration, configFields)
  )
    throw new Error('invalid_input');
  const snapshot = structuredClone(configuration);
  const destinationDocument = JSON.stringify({ bundleId: selected.bundleId, configuration: snapshot });
  if (new TextEncoder().encode(destinationDocument).length > 24000) throw new Error('content_limit');
  let prepared;
  try {
    prepared = state(
      await requestResource(invoke, session, 'prepare_destination_creation', { destinationDocument }),
    );
    if (prepared.status !== 'prepared' || prepared.bundleId !== selected.bundleId) fail();
    const actual = publicConfiguration(prepared.configurationJson);
    const relevant = Object.fromEntries(configFields.map((field) => [field, actual[field]]));
    if (
      JSON.stringify(normalized(relevant)) !== JSON.stringify(normalized(snapshot)) ||
      actual.encryptionKid !== selected.encryption.kid ||
      actual.encryptionPublicKey.kid !== selected.encryption.kid ||
      actual.signingPublicKey.kid !== selected.signing.kid
    )
      fail();
    return freeze({ attempt: prepared, configuration: actual, keys: selected });
  } catch (cause) {
    if (prepared?.status === 'prepared') {
      try {
        await cancelDestinationCreation(invoke, session, prepared.attemptId);
      } catch {
        /* Native expiry still bounds the preview. */
      }
    }
    throw cause;
  }
}
export async function executeDestinationCreation(invoke, session, attempt) {
  const expected = state(attempt);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = state(
      await requestResource(invoke, session, 'execute_destination_creation', {
        attemptId: expected.attemptId,
      }),
      expected,
    );
    if (!['confirmed', 'failed', 'uncertain', 'expired'].includes(result.status)) fail();
    return result;
  } catch (cause) {
    if (
      ['engine_busy', 'vault_pending', 'vault_profile_required'].includes(
        typeof cause === 'string' ? cause : cause?.message,
      )
    )
      throw cause;
    return freeze({
      ...expected,
      status: 'uncertain',
      error: uncertainOperationError(cause),
      httpStatus: null,
    });
  }
}
export async function cancelDestinationCreation(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const value = state(await requestResource(invoke, session, 'cancel_destination_creation', { attemptId }));
  if (value.status !== 'cancelled' || value.attemptId !== attemptId) fail();
  return value;
}
export async function destinationCreationState(invoke, session) {
  return state(await requestResource(invoke, session, 'destination_creation_state'));
}
export async function reconcileDestinationCreation(invoke, session, bundleId, destinationId) {
  if (!uuid(bundleId) || !uuid(destinationId)) throw new Error('invalid_input');
  const value = state(
    await requestResource(invoke, session, 'reconcile_destination_creation', { bundleId, destinationId }),
  );
  if (value.status !== 'confirmed' || value.bundleId !== bundleId || value.destinationId !== destinationId)
    fail();
  return value;
}
export async function useGeneratedKeys(invoke, session, bundleId, destinationId) {
  if (!uuid(bundleId) || !uuid(destinationId)) throw new Error('invalid_input');
  const value = await requestResource(invoke, session, 'use_generated_keys', { bundleId, destinationId });
  if (
    !exact(value, ['keys']) ||
    !Array.isArray(value.keys) ||
    value.keys.length > 16 ||
    !['decrypt', 'sign'].every((purpose) =>
      value.keys.some((key) => key.destinationId === destinationId && key.purpose === purpose),
    )
  )
    fail();
  for (const key of value.keys)
    if (
      !exact(key, ['destinationId', 'kid', 'purpose']) ||
      !uuid(key.destinationId) ||
      typeof key.kid !== 'string' ||
      key.kid.length > 512 ||
      !['decrypt', 'sign'].includes(key.purpose)
    )
      fail();
  return freeze({ ...value });
}
