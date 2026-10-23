const fail = () => {
  throw new Error('engine_protocol_error');
};
export const exportSource = (item, reply = false) => ({
  proofId: item.proofId || null,
  recordId: item.recordId || null,
  messageId: (reply ? item.replyId : item.submissionId) || item.recordId,
  reply,
});
export async function beginMessageExport(invoke, session) {
  const result = await invoke('begin_message_export', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
  });
  if (result === null) return null;
  if (
    !result ||
    !/^export-[0-9a-f]{16}$/.test(result.exportId) ||
    typeof result.directory !== 'string' ||
    !result.directory
  )
    fail();
  return Object.freeze({ ...result });
}
export async function exportMessage(invoke, session, exportId, source) {
  const result = await invoke('export_message', {
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    exportId,
    source,
  });
  if (
    !result ||
    typeof result.directory !== 'string' ||
    !result.directory ||
    !Number.isSafeInteger(result.fileCount) ||
    result.fileCount < 1 ||
    result.fileCount > 41 ||
    !Number.isSafeInteger(result.totalBytes) ||
    result.totalBytes < 0 ||
    result.totalBytes > 64 * 1024 * 1024
  )
    fail();
  return Object.freeze({ ...result });
}
export async function finishMessageExport(invoke, exportId) {
  await invoke('finish_message_export', { exportId });
}
