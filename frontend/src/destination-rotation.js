import { cancelledProductionAction } from './environments.js';
import { requestResource } from './resources.js';
import { uncertainOperationError } from './diagnostics.js';

const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));
const fail = () => {
  throw new Error('engine_protocol_error');
};
const fields = [
  'destinationId',
  'name',
  'bundleId',
  'beforeEncryptionKid',
  'encryptionKid',
  'signingKid',
  'status',
  'stage',
  'error',
  'httpStatus',
];
const identity = ['destinationId', 'bundleId', 'beforeEncryptionKid', 'encryptionKid', 'signingKid', 'name'];
function state(value, expected) {
  if (
    !exact(value, ['attemptId', 'status', 'changes']) ||
    ![
      'idle',
      'prepared',
      'running',
      'completed',
      'partial',
      'uncertain',
      'conflict',
      'failed',
      'expired',
      'cancelled',
    ].includes(value.status) ||
    (value.status === 'idle' ? value.attemptId !== null : !uuid(value.attemptId)) ||
    !Array.isArray(value.changes) ||
    value.changes.length > 10 ||
    (!['idle', 'cancelled'].includes(value.status) && !value.changes.length)
  )
    fail();
  const ids = new Set(),
    bundles = new Set();
  const changes = value.changes.map((row) => {
    if (
      !exact(row, fields) ||
      !uuid(row.destinationId) ||
      !uuid(row.bundleId) ||
      ids.has(row.destinationId) ||
      bundles.has(row.bundleId) ||
      typeof row.name !== 'string' ||
      row.name.length > 256 ||
      /[\x00-\x1f\x7f]/.test(row.name) ||
      !uuid(row.encryptionKid) ||
      !uuid(row.signingKid) ||
      row.encryptionKid === row.signingKid ||
      typeof row.beforeEncryptionKid !== 'string' ||
      !row.beforeEncryptionKid ||
      row.beforeEncryptionKid.length > 512 ||
      !['prepared', 'unchanged', 'updated', 'failed', 'uncertain', 'skipped'].includes(row.status) ||
      !['not_started', 'verified', 'not_confirmed', 'partially_registered'].includes(row.stage) ||
      (row.error !== null && (typeof row.error !== 'string' || !/^[a-z_]{1,64}$/.test(row.error))) ||
      (row.httpStatus !== null &&
        (!Number.isInteger(row.httpStatus) ||
          row.httpStatus < 100 ||
          row.httpStatus > 599 ||
          row.error === null))
    )
      fail();
    ids.add(row.destinationId);
    bundles.add(row.bundleId);
    return Object.freeze({ ...row });
  });
  if (
    expected &&
    (value.attemptId !== expected.attemptId ||
      changes.length !== expected.changes.length ||
      changes.some((row, index) => identity.some((key) => row[key] !== expected.changes[index][key])))
  )
    fail();
  return Object.freeze({ ...value, changes: Object.freeze(changes) });
}
export async function prepareDestinationRotation(invoke, session, targets) {
  if (
    session?.apiVersion !== 'v3' ||
    !Array.isArray(targets) ||
    !targets.length ||
    targets.length > 10 ||
    targets.some(
      (row) =>
        !uuid(row.destinationId) || !uuid(row.bundleId) || !uuid(row.encryptionKid) || !uuid(row.signingKid),
    ) ||
    new Set(targets.map((row) => row.destinationId)).size !== targets.length ||
    new Set(targets.map((row) => row.bundleId)).size !== targets.length
  )
    throw new Error('invalid_input');
  const selected = targets.map((row) => ({ ...row }));
  let result;
  try {
    result = state(
      await requestResource(invoke, session, 'prepare_destination_rotation', {
        destinationDocument: JSON.stringify({
          destinations: selected.map(({ destinationId, bundleId }) => ({ destinationId, bundleId })),
        }),
      }),
    );
    if (
      result.status !== 'prepared' ||
      result.changes.length !== selected.length ||
      result.changes.some(
        (row, index) =>
          ['destinationId', 'bundleId', 'encryptionKid', 'signingKid'].some(
            (key) => row[key] !== selected[index][key],
          ) ||
          !['prepared', 'unchanged'].includes(row.status) ||
          row.stage !== 'not_started' ||
          row.error !== null,
      )
    )
      fail();
    return result;
  } catch (cause) {
    if (result?.status === 'prepared') {
      try {
        await cancelDestinationRotation(invoke, session, result.attemptId);
      } catch {
        /* Expiry bounds a lost cancellation. */
      }
    }
    throw cause;
  }
}
export async function executeDestinationRotation(invoke, session, preview) {
  const expected = state(preview);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = state(
      await requestResource(invoke, session, 'execute_destination_rotation', {
        attemptId: expected.attemptId,
      }),
      expected,
    );
    if (!['completed', 'partial', 'uncertain', 'conflict', 'failed', 'expired'].includes(result.status))
      fail();
    return result;
  } catch (cause) {
    if (cancelledProductionAction(cause)) throw cause;
    throw new Error(uncertainOperationError(cause));
  }
}
export async function cancelDestinationRotation(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = state(await requestResource(invoke, session, 'cancel_destination_rotation', { attemptId }));
  if (result.attemptId !== attemptId || result.status !== 'cancelled' || result.changes.length) fail();
  return result;
}
export async function destinationRotationState(invoke, session) {
  return state(await requestResource(invoke, session, 'destination_rotation_state'));
}
