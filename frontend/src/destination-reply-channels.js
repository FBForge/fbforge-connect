const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validReplyChannels(value) {
  if (value == null) return true;
  if (!object(value) || !Object.keys(value).length) return false;
  return Object.entries(value).every(([key, channel]) => {
    if (!object(channel)) return false;
    if (key === 'fitConnect') {
      const rows = channel.processStandards;
      return (
        Object.keys(channel).join() === 'processStandards' &&
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows.length <= 16 &&
        new Set(rows).size === rows.length &&
        rows.every(
          (uri) =>
            typeof uri === 'string' &&
            uri.length <= 4096 &&
            /^(https:\/\/|urn:)/.test(uri) &&
            !/[\x00-\x20\x7f]/.test(uri),
        )
      );
    }
    if (key === 'eMail')
      return (
        Object.keys(channel).every((name) => name === 'usePgp') &&
        (channel.usePgp === undefined || typeof channel.usePgp === 'boolean')
      );
    if (key === 'idBundDeMailbox')
      return (
        Object.keys(channel).join() === 'useStatusMonitor' && typeof channel.useStatusMonitor === 'boolean'
      );
    return ['deMail', 'elster', 'fink'].includes(key) && Object.keys(channel).length === 0;
  });
}
