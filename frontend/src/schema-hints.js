export const own = (object, key) => object !== null && typeof object === 'object' && Object.hasOwn(object, key);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const cleanText = (value, max = 512) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) + (value.trim().length > max ? ' …' : '') : null;
export const escapePointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
export function resolveUri(reference, base) {
  try { return reference.startsWith('#') ? base.split('#')[0] + reference : new URL(reference, base).href; } catch { return null; }
}
export function budget() {
  let remaining = 60000;
  return () => { if (--remaining < 0) throw new Error('schema_view_limit'); };
}
export function source(context) { return { uri: context.uri, location: context.location, kind: context.kind }; }
export function mergeHints(candidates, required = null) {
  if (!candidates.length || candidates.some(candidate => !candidate.length)) return null;
  let ambiguous = false;
  function choice(key) {
    const values = candidates.map(rows => {
      const choices = rows.filter(row => row[key] !== null && row[key] !== undefined);
      if (!choices.length) return null;
      const rank = Math.min(...choices.map(row => row.rank));
      const unique = [...new Set(choices.filter(row => row.rank === rank).map(row => row[key]))];
      if (unique.length !== 1) { ambiguous = true; return null; }
      return unique[0];
    });
    if (values.some(value => value === null)) { if (values.some(value => value !== null)) ambiguous = true; return null; }
    if (new Set(values).size !== 1) { ambiguous = true; return null; }
    return values[0];
  }
  const title = choice('title'), description = choice('description'), type = choice('type'), format = choice('format'), valueLabel = choice('valueLabel');
  const sources = []; const seen = new Set();
  for (const candidate of candidates) for (const row of candidate) {
    const id = JSON.stringify(row.source);
    if (!seen.has(id)) { sources.push(row.source); seen.add(id); }
  }
  return { title, description, type, format, valueLabel, required, ambiguous, sources: sources.slice(0, 8), sourceCount: sources.length };
}
