import type { NativeInvoke, Session, ApiVersion, SessionRole, Environment } from './contracts.d.ts';
import { record } from './dto.ts';
import { validEnvironment } from './environments.js';
const roles = new Set(['online-service', 'administrative-system']);
const versions = new Set(['v2', 'v3']);
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(
  result: unknown,
  apiVersion: ApiVersion,
  role: SessionRole,
  connected: boolean,
  sessionId?: string,
  environment: Environment = 'TEST',
): Session {
  if (
    !record(result) ||
    result.apiVersion !== apiVersion ||
    result.role !== role ||
    !validEnvironment(environment) ||
    result.environment !== environment ||
    result.connected !== connected ||
    typeof result.sessionId !== 'string' ||
    !sessionIdPattern.test(result.sessionId) ||
    (sessionId !== undefined && result.sessionId !== sessionId)
  )
    throw new Error('engine_protocol_error');
  // Pick public fields explicitly rather than retaining an arbitrary native response object.
  return { sessionId: result.sessionId, apiVersion, role, environment, connected };
}

export async function openSession(
  invoke: NativeInvoke,
  apiVersion: ApiVersion,
  role: SessionRole,
  clientId: string,
  clientSecret: string,
  profile: { profileId: string; name: string } | null = null,
  environment: Environment = 'TEST',
) {
  if (
    !versions.has(apiVersion) ||
    !roles.has(role) ||
    typeof clientId !== 'string' ||
    !clientId.trim() ||
    clientId.length > 512 ||
    typeof clientSecret !== 'string' ||
    !clientSecret.trim() ||
    clientSecret.length > 8192
  )
    throw new Error('invalid_credentials');
  if (
    profile !== null &&
    (!sessionIdPattern.test(profile.profileId) ||
      typeof profile.name !== 'string' ||
      !profile.name.trim() ||
      new TextEncoder().encode(profile.name).length > 120 ||
      /[\x00-\x1f\x7f]/.test(profile.name))
  )
    throw new Error('invalid_input');
  const result = validate(
    await invoke('open_session', {
      apiVersion,
      role,
      clientId,
      clientSecret,
      ...(profile ? { profileId: profile.profileId, profileName: profile.name } : {}),
    }),
    apiVersion,
    role,
    true,
    undefined,
    environment,
  );
  return { ...result, clientId };
}

export async function updateSession(invoke: NativeInvoke, session: Session, connected: boolean) {
  if (
    !session ||
    !versions.has(session.apiVersion) ||
    !roles.has(session.role) ||
    !sessionIdPattern.test(session.sessionId)
  )
    throw new Error('session_missing');
  const result = validate(
    await invoke(connected ? 'check_session' : 'close_session', {
      apiVersion: session.apiVersion,
      sessionId: session.sessionId,
    }),
    session.apiVersion,
    session.role,
    connected,
    session.sessionId,
    session.environment,
  );
  return connected && typeof session.clientId === 'string'
    ? { ...result, clientId: session.clientId }
    : result;
}

export async function openSessionForApi(invoke: NativeInvoke, source: Session, targetApiVersion: ApiVersion) {
  if (
    !source?.connected ||
    !versions.has(source.apiVersion) ||
    !roles.has(source.role) ||
    !sessionIdPattern.test(source.sessionId) ||
    !versions.has(targetApiVersion) ||
    source.apiVersion === targetApiVersion ||
    typeof source.clientId !== 'string' ||
    !source.clientId
  )
    throw new Error('invalid_input');
  const result = validate(
    await invoke('open_session_for_api', {
      apiVersion: source.apiVersion,
      sessionId: source.sessionId,
      targetApiVersion,
    }),
    targetApiVersion,
    source.role,
    true,
    undefined,
    source.environment,
  );
  if (result.sessionId === source.sessionId) throw new Error('engine_protocol_error');
  return { ...result, clientId: source.clientId };
}

export function resetsSessions(cause: unknown) {
  const code = typeof cause === 'string' ? cause : record(cause) ? cause.message : undefined;
  return [
    'engine_timeout',
    'engine_protocol_error',
    'engine_disconnected',
    'engine_not_staged',
    'engine_start_failed',
  ].includes(typeof code === 'string' ? code : '');
}
