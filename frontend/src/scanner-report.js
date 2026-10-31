// The list contains only released attachments. Blocked files are reported separately.
export function attachmentScanStatus(warnings) {
  if (!Array.isArray(warnings)) return 'unknown';
  const passed = warnings.includes('MALWARE_SCAN_PASSED') || warnings.includes('MALWARE_ATTACHMENT_BLOCKED');
  const notConfigured = warnings.includes('MALWARE_SCAN_NOT_CONFIGURED');
  if (passed && notConfigured) return 'unknown';
  return passed ? 'passed' : notConfigured ? 'not_configured' : 'unknown';
}

export function checkedBlockedAttachments(value) {
  if (
    !Array.isArray(value) ||
    value.length > 39 ||
    value.some(
      (item) =>
        !item ||
        Object.keys(item).length !== 2 ||
        typeof item.attachmentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.attachmentId) ||
        typeof item.fileName !== 'string' ||
        item.fileName.length > 128 ||
        /[\x00-\x1f\x7f]/.test(item.fileName),
    ) ||
    new Set(value.map((item) => item.attachmentId)).size !== value.length
  )
    throw new Error('engine_protocol_error');
  return Object.freeze(value.map((item) => Object.freeze({ ...item })));
}

export function readScannerReport(text) {
  const value = JSON.parse(text);
  if (!value || Object.keys(value).length !== 2 || value.version !== 1)
    throw new Error('engine_protocol_error');
  return checkedBlockedAttachments(value.blockedAttachments);
}
