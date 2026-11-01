import { compareTestContent } from './test-flows.js';
const preview = (value) => (value === undefined ? 'Fehlt' : JSON.stringify(value).slice(0, 300));
/** Bounded, literal output. Never render data as HTML or weaken the pass/fail comparison. */
export function contentDifferences(actual, expected, mimeType) {
  if (compareTestContent(actual, expected, mimeType)) return [];
  if (mimeType !== 'application/json')
    return [{ path: '$', expected: 'Exakter XML-Inhalt des Testfalls', actual: 'Der XML-Inhalt weicht ab' }];
  try {
    const rows = [];
    const visit = (a, b, path, depth) => {
      if (rows.length >= 20) return;
      if (depth > 24) {
        rows.push({ path, expected: 'Wert des Testfalls', actual: 'Abweichung in tiefer Struktur' });
        return;
      }
      if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const key of new Set([...Object.keys(b), ...Object.keys(a)]))
          visit(a[key], b[key], `${path}[${JSON.stringify(key)}]`, depth + 1);
      } else if (JSON.stringify(a) !== JSON.stringify(b))
        rows.push({ path, expected: preview(b), actual: preview(a) });
    };
    visit(JSON.parse(actual), JSON.parse(expected), '$', 0);
    return rows.length
      ? rows
      : [
          {
            path: '$',
            expected: 'Eindeutige JSON-Felder des Testfalls',
            actual: 'Die JSON-Struktur weicht ab',
          },
        ];
  } catch {
    return [
      { path: '$', expected: 'Gültiges JSON des Testfalls', actual: 'JSON konnte nicht gelesen werden' },
    ];
  }
}
