const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const purposes = new Set(['decrypt', 'sign']);
const fail = () => {
  throw new Error('engine_protocol_error');
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value) => typeof value === 'string' && uuidPattern.test(value);
const text = (value, max, nullable = false) =>
  (nullable && value === null) || (typeof value === 'string' && value.length <= max);
const exact = (value, fields) =>
  object(value) &&
  Object.keys(value).every((key) => fields.includes(key)) &&
  fields.every((key) => Object.hasOwn(value, key));

// Native JSON transport may reorder object fields. Array order and all values remain significant.
export function sameJsonValue(actual, expected) {
  if (actual === expected) return true;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => sameJsonValue(actual[index], value))
    );
  if (object(expected))
    return (
      exact(actual, Object.keys(expected)) &&
      Object.keys(expected).every((key) => sameJsonValue(actual[key], expected[key]))
    );
  return false;
}

function context(session) {
  if (
    !session ||
    !['v2', 'v3'].includes(session.apiVersion) ||
    !uuid(session.sessionId) ||
    session.environment !== 'TEST' ||
    session.connected !== true
  )
    throw new Error('session_missing');
  return { apiVersion: session.apiVersion, sessionId: session.sessionId };
}
function destinationId(value) {
  if (!uuid(value)) throw new Error('invalid_input');
  return value.toLowerCase();
}
export async function requestResource(invoke, session, command, args = {}) {
  const expected = context(session);
  const result = await invoke(command, { ...expected, ...args });
  if (
    !exact(result, ['apiVersion', 'sessionId', 'environment', 'data']) ||
    result.environment !== 'TEST' ||
    result.apiVersion !== expected.apiVersion ||
    result.sessionId !== expected.sessionId
  )
    fail();
  return result.data;
}

export async function listDestinations(invoke, session, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || offset % 20 !== 0)
    throw new Error('invalid_input');
  const data = await requestResource(invoke, session, 'list_destinations', { offset });
  if (
    !exact(data, ['destinations', 'offset', 'totalCount']) ||
    data.offset !== offset ||
    !Number.isSafeInteger(data.totalCount) ||
    data.totalCount < 0 ||
    data.totalCount > 1000000 ||
    !Array.isArray(data.destinations) ||
    data.destinations.length > 20 ||
    offset + data.destinations.length > data.totalCount
  )
    fail();
  const seen = new Set();
  const destinations = data.destinations.map((item) => {
    if (
      !exact(item, ['destinationId', 'name', 'status', 'type']) ||
      !uuid(item.destinationId) ||
      !text(item.name, 512, true) ||
      !text(item.status, 64, true) ||
      !text(item.type, 64, true) ||
      seen.has(item.destinationId.toLowerCase())
    )
      fail();
    seen.add(item.destinationId.toLowerCase());
    return { destinationId: item.destinationId, name: item.name, status: item.status, type: item.type };
  });
  return { destinations, offset, totalCount: data.totalCount };
}

export function publicDocument(source, expectedId) {
  if (!text(source, 262144)) fail();
  let root;
  try {
    root = JSON.parse(source);
  } catch {
    fail();
  }
  if (!object(root) || root.destinationId !== expectedId) fail();
  const pending = [root];
  let count = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++count > 20000) fail();
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (
          /^(?:secret|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|authorization)$/i.test(
            key,
          )
        )
          fail();
        if (object(value) && value.kty === 'RSA' && ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].includes(key))
          fail();
        if (child && typeof child === 'object') pending.push(child);
      }
    }
  }
  return JSON.stringify(root, null, 2);
}

export async function loadDestination(invoke, session, id) {
  id = destinationId(id);
  const data = await requestResource(invoke, session, 'load_destination', { destinationId: id });
  if (
    !exact(data, ['destinationId', 'detailsJson', 'keys']) ||
    data.destinationId !== id ||
    !Array.isArray(data.keys) ||
    data.keys.length > 128
  )
    fail();
  const detailsJson = publicDocument(data.detailsJson, id);
  const seen = new Set();
  const keys = data.keys.map((key) => {
    if (
      !exact(key, ['kid', 'purpose', 'eligible', 'reason', 'certificateSha256', 'expiresAt']) ||
      !text(key.kid, 512) ||
      !key.kid ||
      seen.has(key.kid) ||
      !text(key.purpose, 64) ||
      typeof key.eligible !== 'boolean'
    )
      fail();
    if (key.eligible) {
      if (
        !purposes.has(key.purpose) ||
        key.reason !== null ||
        typeof key.certificateSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(key.certificateSha256) ||
        !text(key.expiresAt, 64) ||
        !Number.isFinite(Date.parse(key.expiresAt))
      )
        fail();
    } else if (
      !text(key.reason, 512) ||
      !key.reason ||
      key.certificateSha256 !== null ||
      key.expiresAt !== null
    )
      fail();
    seen.add(key.kid);
    return {
      kid: key.kid,
      purpose: key.purpose,
      eligible: key.eligible,
      reason: key.reason,
      certificateSha256: key.certificateSha256,
      expiresAt: key.expiresAt,
    };
  });
  return { destinationId: id, detailsJson, keys };
}

function keyState(data) {
  if (!exact(data, ['keys']) || !Array.isArray(data.keys) || data.keys.length > 16) fail();
  const seen = new Set();
  return {
    keys: data.keys.map((key) => {
      if (
        !exact(key, ['destinationId', 'kid', 'purpose']) ||
        !uuid(key.destinationId) ||
        !text(key.kid, 512) ||
        !key.kid ||
        !purposes.has(key.purpose)
      )
        fail();
      const identity = `${key.destinationId}/${key.purpose}/${key.kid}`;
      if (seen.has(identity)) fail();
      seen.add(identity);
      return { destinationId: key.destinationId, kid: key.kid, purpose: key.purpose };
    }),
  };
}
export async function loadedKeys(invoke, session) {
  return keyState(await requestResource(invoke, session, 'loaded_keys'));
}
export async function discardKeys(invoke, session) {
  const result = keyState(await requestResource(invoke, session, 'discard_keys'));
  if (result.keys.length) fail();
  return result;
}
export async function importKey(invoke, session, id, purpose, keyDocument) {
  id = destinationId(id);
  if (
    !(purposes.has(purpose) || purpose === 'auto') ||
    typeof keyDocument !== 'string' ||
    !keyDocument.trim() ||
    new TextEncoder().encode(keyDocument).byteLength > 32768
  )
    throw new Error('invalid_input');
  const result = keyState(
    await requestResource(invoke, session, 'import_key', { destinationId: id, purpose, keyDocument }),
  );
  if (!result.keys.some((key) => key.destinationId === id && (purpose === 'auto' || key.purpose === purpose)))
    fail();
  return result;
}
