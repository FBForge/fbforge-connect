const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const destinationExtraFields = ['callback', 'senderAccessRestricted', 'publicForRouting'];
export function backupExtraChanges(value) {
  const changes = Object.fromEntries(
    ['senderAccessRestricted', 'publicForRouting']
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, structuredClone(value[key])]),
  );
  if (Object.hasOwn(value.contactInformation || {}, 'cc'))
    changes.contactInformation = { cc: value.contactInformation.cc };
  return { changes, callback: value.callback?.url || '' };
}
export function validDestinationExtras(value) {
  if (!object(value)) return false;
  if (Object.hasOwn(value, 'publicForRouting') && typeof value.publicForRouting !== 'boolean') return false;
  if (Object.hasOwn(value, 'callback') && value.callback !== null) {
    const c = value.callback;
    if (
      !object(c) ||
      Object.keys(c).some((k) => !['url', 'secret'].includes(k)) ||
      typeof c.url !== 'string' ||
      c.url.length > 4096
    )
      return false;
    try {
      const u = new URL(c.url);
      if (u.protocol !== 'https:' || u.username || u.password || u.hash) return false;
    } catch {
      return false;
    }
    if (
      Object.hasOwn(c, 'secret') &&
      (typeof c.secret !== 'string' ||
        c.secret.length < 32 ||
        c.secret.length > 512 ||
        /[\x00-\x1f\x7f]/.test(c.secret))
    )
      return false;
  }
  if (Object.hasOwn(value, 'senderAccessRestricted')) {
    const a = value.senderAccessRestricted;
    if (
      !object(a) ||
      typeof a.enabled !== 'boolean' ||
      Object.keys(a).some((k) => !['enabled', 'allowedSenders', 'allowedSenderDestinations'].includes(k))
    )
      return false;
    for (const field of ['allowedSenders', 'allowedSenderDestinations'])
      if (
        a[field] != null &&
        (!Array.isArray(a[field]) ||
          a[field].length > 128 ||
          a[field].some((id) => !uuid(id)) ||
          new Set(a[field]).size !== a[field].length)
      )
        return false;
  }
  return true;
}
export function destinationConfiguration(value) {
  const required = [
    'name',
    'type',
    'contactInformation',
    'metadataVersions',
    'publicServices',
    'processMessages',
  ];
  return (
    object(value) &&
    required.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every((k) => [...required, ...destinationExtraFields].includes(k)) &&
    validDestinationExtras(value)
  );
}
export function withoutCallbackSecret(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (key === 'secret' ? '[nicht angezeigt]' : item)));
}
