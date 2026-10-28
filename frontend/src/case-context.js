import { validEnvironment } from './environments.js';
/** Public navigation context only. This index is never a native proof or a permission to write. */
export const caseWorkspaceKey = Symbol('case-workspace');
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function createCaseWorkspace(changed = () => {}) {
  let records = [];
  function remember(session, value) {
    if (
      !session?.connected ||
      !validEnvironment(session.environment) ||
      !['v2', 'v3'].includes(session.apiVersion) ||
      !uuid(session.sessionId) ||
      !uuid(value?.caseId)
    )
      return;
    const type = value.replyId ? 'reply' : value.submissionId ? 'submission' : 'case';
    const subjectId = type === 'case' ? value.caseId : value[`${type}Id`];
    if (!uuid(subjectId) || (type === 'submission' && !uuid(value.destinationId))) return;
    const item = Object.freeze({
      apiVersion: session.apiVersion,
      sessionId: session.sessionId,
      caseId: value.caseId,
      subjectType: type,
      subjectId,
      ...(type === 'submission'
        ? { destinationId: value.destinationId, submissionId: subjectId }
        : type === 'reply'
          ? { replyId: subjectId }
          : {}),
    });
    records = Object.freeze(
      [
        item,
        ...records.filter(
          (other) =>
            !(
              other.apiVersion === item.apiVersion &&
              other.sessionId === item.sessionId &&
              other.subjectType === type &&
              other.subjectId === subjectId
            ),
        ),
      ].slice(0, 100),
    );
    changed(records);
  }
  function clear() {
    records = Object.freeze([]);
    changed(records);
  }
  function list(session) {
    return Object.freeze(
      records.filter(
        (item) => item.sessionId === session?.sessionId && item.apiVersion === session?.apiVersion,
      ),
    );
  }
  return Object.freeze({ remember, clear, list });
}
