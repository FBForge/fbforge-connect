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
  const rootItemCount = flat.filter((n) => n.parent === root.id).length;
  const rows = [];
  for (const node of flat) {
    if (node.branch && parents.has(node.id)) continue;
    const path = [],
      original = [];
    let current = node;
    let problem = false;
    while (current && current.id !== root.id) {
      const parent = mapped.get(current.parent);
      original.unshift(current.label);
      if (parent?.array) {
        const index = Number(current.label.slice(1, -1)) + 1;
        if (parent.label === 'problems') {
          path.unshift(`Problem ${index}`);
          problem = true;
        } else if (parent.label === 'attachments') path.unshift(`Anlage ${index}`);
        else if (parent.id !== root.id || rootItemCount > 1)
          path.unshift(`${parent.id === root.id ? 'Ereignis' : 'Eintrag'} ${index}`);
      } else if (!(current.array && ['problems', 'attachments'].includes(current.label))) {
        path.unshift(labels[current.label] || current.label);
      }
      current = parent;
    }
    if (!current) continue;
    rows.push({
      label: path.join(' · ') || 'Ereignisdaten',
      path: original.join(' · '),
      priority: problem ? ({ detail: 0, instance: 1, title: 2, type: 3 }[node.label] ?? 4) : 5,
      value: node.branch
        ? node.array
          ? '[]'
          : '{}'
        : node.type === 'string'
          ? JSON.parse(node.value)
          : node.value,
    });
  }
  return rows.sort((a, b) => a.priority - b.priority).map(({ priority: _priority, ...row }) => row);
}
