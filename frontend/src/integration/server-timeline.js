import { loadCaseEventLog, listEventLog, discardEventLog } from '../event-log.js';

const prefix = 'https://schema.fitko.de/fit-connect/events/';
export function submissionTimeline(events, submissionId) {
  const selected = events.filter(
    (event) => event.subjectType === 'submission' && event.subjectId === submissionId,
  );
  const submitted = selected.filter((event) => event.eventType === `${prefix}submit-submission`);
  const time = submitted.length === 1 ? Date.parse(submitted[0].issuedAt) : NaN;
  return {
    submittedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
    submitted: submitted.length === 1,
    accepted: selected.some((event) => event.eventType === `${prefix}accept-submission`),
    rejected: selected.some((event) => event.eventType === `${prefix}reject-submission`),
  };
}

// Read signed SETs only. A missing event or a failed read never proves that a write did not happen.
export async function readSubmissionTimeline(invoke, session, item, current = () => true) {
  let summary;
  try {
    summary = await loadCaseEventLog(invoke, session, item.caseId);
    if (summary.total > 100) throw new Error('timeline_limit');
    const events = [];
    for (let offset = 0; offset < summary.total; offset += 5) {
      if (!current()) throw new Error('content_cancelled');
      events.push(...(await listEventLog(invoke, session, summary, offset)).events);
    }
    if (!current()) throw new Error('content_cancelled');
    return submissionTimeline(events, item.submissionId);
  } finally {
    if (summary) await discardEventLog(invoke, session, summary.logId).catch(() => {});
  }
}

export function collectionAge(submittedAt, now = Date.now()) {
  const submitted = typeof submittedAt === 'string' ? Date.parse(submittedAt) : NaN;
  if (!Number.isFinite(submitted) || submitted > now || !Number.isFinite(now)) return null;
  const ageDays = Math.floor((now - submitted) / 86400000);
  return {
    ageDays,
    dueAt: new Date(submitted + 14 * 86400000).toISOString(),
    remainingDays: Math.max(0, 14 - ageDays),
    urgency: ageDays >= 14 ? 'expired' : ageDays >= 9 ? 'urgent' : ageDays >= 3 ? 'attention' : 'normal',
  };
}
