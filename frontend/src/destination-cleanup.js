import { requestResource } from './resources.js';
import { uncertainOperationError } from './diagnostics.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function checked(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== 'attemptId,destinationId,error,name,status' ||
    ![
      'idle',
      'prepared',
      'running',
      'removed',
      'uncertain',
      'failed',
      'cancelled',
      'conflict',
      'expired',
    ].includes(value.status) ||
    (value.status === 'idle'
      ? ['attemptId', 'destinationId', 'name', 'error'].some((key) => value[key] !== null)
      : !uuid(value.attemptId) ||
        !uuid(value.destinationId) ||
        typeof value.name !== 'string' ||
        value.name.length > 256) ||
    (value.error !== null && (typeof value.error !== 'string' || !/^[a-z_]{1,64}$/.test(value.error))) ||
    (expected && ['attemptId', 'destinationId', 'name'].some((key) => value[key] !== expected[key]))
  )
    throw new Error('engine_protocol_error');
  return Object.freeze({ ...value });
}
export async function prepareDestinationCleanup(invoke, session, destinationId) {
  if (session?.apiVersion !== 'v3' || !uuid(destinationId)) throw new Error('invalid_input');
  const result = checked(
    await requestResource(invoke, session, 'prepare_destination_cleanup', { destinationId }),
  );
  if (result.status !== 'prepared' || result.destinationId !== destinationId)
    throw new Error('engine_protocol_error');
  return result;
}
export async function executeDestinationCleanup(invoke, session, preview) {
  const expected = checked(preview);
  if (expected.status !== 'prepared') throw new Error('invalid_input');
  try {
    const result = checked(
      await requestResource(invoke, session, 'execute_destination_cleanup', {
        attemptId: expected.attemptId,
      }),
      expected,
    );
    if (!['removed', 'failed', 'uncertain', 'conflict', 'expired'].includes(result.status))
      throw new Error('engine_protocol_error');
    return result;
  } catch (cause) {
    throw new Error(uncertainOperationError(cause));
  }
}
export async function cancelDestinationCleanup(invoke, session, attemptId) {
  if (!uuid(attemptId)) throw new Error('invalid_input');
  const result = checked(await requestResource(invoke, session, 'cancel_destination_cleanup', { attemptId }));
  if (result.attemptId !== attemptId || result.status !== 'cancelled')
    throw new Error('engine_protocol_error');
  return result;
}
