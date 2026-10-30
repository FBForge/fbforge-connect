import { nodes } from './json-viewer.js';
/** Keep numeric literals and duplicate fields intact. No event content is interpreted as markup. */
const labels = {
  attachments: 'Anlagen',
  attachmentId: 'Anlagen-ID',
  authenticationTag: 'Authentifizierungstag',
  authenticationTags: 'Authentifizierungstags',
  authTag: 'Authentifizierungstag',
  metadata: 'Metadaten',
  data: 'Fachdaten',
  problems: 'Probleme',
  type: 'Typ',
  title: 'Titel',
  detail: 'Beschreibung',
  instance: 'Betroffene Ressource',
  fileName: 'Dateiname',
};
export function eventDetailRows(rawText, eventType) {
  JSON.parse(rawText);
  const flat = nodes(rawText);
  // Oversized/deep structures still show their complete bounded original text inline.
  if (!flat) return [{ label: 'Originale Ereignisdaten', value: rawText }];
  const events = flat.find((n) => n.parent === 0 && n.label === 'events');
  const payload = events && flat.find((n) => n.parent === events.id && n.label === eventType);
  const root = payload || flat[0];
  const mapped = new Map(flat.map((n) => [n.id, n]));
  const parents = new Set(flat.map((n) => n.parent));
  const rows = [];
  for (const node of flat) {
    if (node.branch && parents.has(node.id)) continue;
    const path = [];
    let current = node;
    while (current && current.id !== root.id) {
      const parent = mapped.get(current.parent);
      path.unshift(
        parent?.array
          ? `Eintrag ${Number(current.label.slice(1, -1)) + 1}`
          : labels[current.label] || current.label,
      );
      current = parent;
    }
    if (!current) continue;
    rows.push({
      label: path.join(' · ') || 'Ereignisdaten',
      value: node.branch
        ? node.array
          ? '[]'
          : '{}'
        : node.type === 'string'
          ? JSON.parse(node.value)
          : node.value,
    });
  }
  return rows;
}
