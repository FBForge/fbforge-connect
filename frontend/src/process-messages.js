const text = (value) =>
  typeof value === 'string' && value.trim().length && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);
export function processMessageIdentity(value) {
  if (!value || !text(value.processModelId) || !text(value.messageId))
    throw new Error('process_message_invalid');
  return { processModelId: value.processModelId.trim(), messageId: value.messageId.trim() };
}
export function addProcessReply(current, candidate, schemaUri, mimeType) {
  const row = processMessageIdentity(candidate);
  if (candidate.schemaUri && (candidate.schemaUri !== schemaUri || candidate.mimeType !== mimeType))
    throw new Error('process_schema_mismatch');
  if (current.some((item) => item.processModelId === row.processModelId && item.messageId === row.messageId))
    throw new Error('process_message_duplicate');
  if (current.length >= 16) throw new Error('process_message_limit');
  return [...current, row];
}
export function mappedMessages(model, mapping) {
  if (!model || !mapping) return [];
  // Keep model order stable when editing a mapping moves its entry within the mapping file.
  return model.messages.flatMap((message) => {
    const row = mapping.entries.find((entry) => entry.bpmnMessageId === message.bpmnMessageId);
    return row ? [{ ...row, label: message.name || row.messageId }] : [];
  });
}
