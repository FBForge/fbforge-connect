import { messageFields, xmlTree, expanded, fieldSnippet } from './fields.ts';
import type { Difference } from './types.ts';
type Entry = { type: string; raw: string };
function entries(source: string, mime: string) {
  const rows = new Map<string, Entry>();
  let bytes = 0;
  const put = (path: string, type: string, raw: string) => {
    if (path.length > 1024 || rows.size > 10000 || (bytes += path.length + raw.length) > 512 * 1024)
      throw Error();
    rows.set(path, { type, raw });
  };
  if (mime === 'application/json') {
    for (const f of messageFields(source, mime)) put(f.path, f.type, f.raw);
    const walk = (value: unknown, path: string, depth: number) => {
      if (depth > 64) throw Error();
      if (!value || typeof value !== 'object') return;
      put(
        path || '$',
        Array.isArray(value) ? 'array' : 'object',
        Array.isArray(value) ? `Liste (${value.length})` : `Objekt (${Object.keys(value).length} Felder)`,
      );
      for (const [key, child] of Object.entries(value))
        walk(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, depth + 1);
    };
    walk(JSON.parse(source), '', 0);
  } else {
    const walk = (node: ReturnType<typeof xmlTree>, path: string, depth: number) => {
      if (depth > 64) throw Error();
      put(path, 'element', expanded(node.name, node.ns));
      for (const [name, value] of Object.entries(node.attrs)) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        const key = expanded(name, node.ns, true);
        if (key.length > 1024) throw Error();
        put(`${path}/@${encodeURIComponent(key)}`, 'attribute', JSON.stringify(value));
      }
      let orderLength = 0;
      const order = node.content.map((child) => {
        const name = typeof child === 'string' ? 'Text' : expanded(child.name, child.ns);
        if (name.length > 1024 || (orderLength += name.length + 3) > 512 * 1024) throw Error();
        return name;
      });
      put(`${path}/Reihenfolge`, 'sequence', order.join(' → '));
      let textIndex = 0;
      const counts = new Map<string, number>();
      node.content.forEach((child) => {
        if (typeof child === 'string') put(`${path}/text()[${++textIndex}]`, 'text', JSON.stringify(child));
        else {
          const name = expanded(child.name, child.ns);
          if (name.length > 1024) throw Error();
          const index = (counts.get(name) || 0) + 1;
          counts.set(name, index);
          walk(child, `${path}/${encodeURIComponent(name)}[${index}]`, depth + 1);
        }
      });
    };
    const root = xmlTree(source),
      name = expanded(root.name, root.ns);
    if (name.length > 1024) throw Error();
    walk(root, `/${encodeURIComponent(name)}[1]`, 0);
  }
  return rows;
}
export function contentDifferences(actual: string, expected: string, mime: string): Difference[] {
  try {
    const before = entries(expected, mime),
      after = entries(actual, mime),
      rows: Difference[] = [];
    for (const path of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(path),
        b = after.get(path);
      if (a?.type === b?.type && a?.raw === b?.raw) continue;
      const display = (entry: Entry) =>
        `${entry.raw.length > 480 ? fieldSnippet(entry.raw, 480) + '…' : entry.raw} (${entry.type})`;
      rows.push({
        path,
        expected: a ? display(a) : 'Nicht vorhanden',
        actual: b ? display(b) : 'Fehlt',
      });
      if (rows.length === 21) break;
    }
    if (rows.length) return rows;
  } catch {
    /* The authoritative comparison already failed. Detail limits never turn it green. */
  }
  return [
    {
      path: 'Dokumentstruktur oder Schreibweise',
      expected: 'Struktur, Reihenfolge und Inhalt des Testfalls',
      actual: 'Abweichung. Originalinhalte für den vollständigen Vergleich öffnen.',
    },
  ];
}
