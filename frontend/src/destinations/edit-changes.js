const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Single edits compare against the loaded snapshot. Bulk edits require explicit field selection. */
export function destinationEditChanges({ baseline, name, status, versions, contacts, offers, enabled }) {
  const result = {};
  const metadataVersions = versions
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  for (const [key, value, before, selected] of [
    ['name', name, baseline?.name || '', enabled.name],
    ['status', status, baseline?.status, enabled.status],
    ['metadataVersions', metadataVersions, baseline?.metadataVersions, enabled.versions],
  ]) {
    if (baseline ? !same(value, before) : selected) result[key] = value;
  }
  const contactInformation = {};
  for (const [key, field] of Object.entries(contacts)) {
    const value = field.value || null;
    if (baseline ? !same(value, baseline.contact[key] || null) : field.enabled)
      contactInformation[key] = value;
  }
  if (Object.keys(contactInformation).length) result.contactInformation = contactInformation;
  if (baseline && enabled.offers) {
    for (const key of ['publicServices', 'processMessages'])
      if (!same(offers[key], baseline.offers?.[key] || [])) result[key] = offers[key];
  }
  return result;
}
