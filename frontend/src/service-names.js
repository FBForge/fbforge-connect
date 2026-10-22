// Public catalogue lookup. Destination offers remain authoritative for addressing and schemas.
const source = 'https://fimportal.de/api/v1/leistung-steckbriefe';
const cache = new Map();
const limit = 256 * 1024;
export const leikaCode = (identifier) =>
  /^urn:de:fim:leika:leistung:(\d{14})$/i.exec(identifier)?.[1] || null;
export function exactServiceName(document, code) {
  if (!document || !Array.isArray(document.items) || document.items.length > 20) return null;
  const names = document.items
    .filter((item) => item && String(item.leistungsschluessel) === code)
    .map((item) => item.title || item.leistungsbezeichnung)
    .filter(
      (title) =>
        typeof title === 'string' && title.trim() && title.length <= 256 && !/[\x00-\x1f\x7f]/.test(title),
    )
    .map((title) => title.trim());
  return names.length && new Set(names).size === 1 ? names[0] : null;
}
export async function lookupServiceName(identifier, signal, fetcher = fetch) {
  const code = leikaCode(identifier);
  if (!code) return null;
  const saved = cache.get(code);
  if (saved && Date.now() < saved.expires) return saved.name;
  const url = `${source}?fts_query=${code}&order_by=relevance&offset=0&limit=20`;
  const response = await fetcher(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (
    !response.ok ||
    !/^application\/json\b/i.test(response.headers.get('content-type') || '') ||
    Number(response.headers.get('content-length')) > limit ||
    !response.body
  )
    throw new Error('service_names_unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('service_names_unavailable');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const name = exactServiceName(JSON.parse(text), code);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(code, { name, expires: Date.now() + 15 * 60 * 1000 });
    return name;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
