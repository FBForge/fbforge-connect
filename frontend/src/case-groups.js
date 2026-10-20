const timestamp = (record) => Date.parse(record.createdAt) || 0;
const chronological = (left, right) =>
  timestamp(left) - timestamp(right) || left.recordId.localeCompare(right.recordId);
const searchable = (record) =>
  [record.title, record.caseId, record.submissionId, record.replyId, record.destinationId]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('de');

// The caller supplies records from exactly one native profile/API context.
export function caseGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = record.caseId ? `case:${record.caseId}` : `message:${record.recordId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups]
    .map(([key, entries]) => {
      const messages = entries.toSorted(chronological);
      const initial = messages.find((record) => record.kind === 'submission');
      const latest = messages.at(-1);
      return {
        key,
        caseId: latest.caseId,
        title: initial?.title || 'Vorgang',
        messages,
        latest,
        attention: messages.filter(
          (record) =>
            ['uncertain', 'failed', 'unavailable'].includes(record.status) || record.available === false,
        ),
      };
    })
    .toSorted((left, right) => chronological(right.latest, left.latest));
}
export function filterCaseGroups(groups, query = '', direction = 'all') {
  const needle = query.trim().toLocaleLowerCase('de');
  return groups.filter((group) =>
    group.messages.some(
      (record) =>
        (direction === 'all' || record.direction === direction) && searchable(record).includes(needle),
    ),
  );
}
export function defaultCaseMessage(group, query = '') {
  const available = group.messages.filter((record) => record.available !== false);
  const needle = query.trim().toLocaleLowerCase('de');
  const exact =
    needle &&
    (available.findLast((record) => record.replyId === needle) ||
      available.find((record) => record.kind === 'submission' && record.submissionId === needle) ||
      available.findLast((record) => record.submissionId === needle));
  return exact || available.find((record) => record.kind === 'submission') || available.at(-1) || null;
}
