// Presentation only. Never use these values for validation, storage or transport.
export function fieldDisplay(node) {
  const raw = node.value;
  const hint = node.schema?.ambiguous ? null : node.schema;
  if (hint?.valueLabel) return hint.valueLabel;
  const type = node.type === 'boolean' ? 'boolean' : hint?.valueType;
  if (type === 'boolean') {
    if (raw === 'true' || raw === '1') return 'Ja';
    if (raw === 'false' || raw === '0') return 'Nein';
  }
  const format = type === 'date' || type === 'date-time' ? type : hint?.format;
  if (!['date', 'date-time'].includes(format) || typeof raw !== 'string') return raw;
  const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(raw);
  if (!match || Number(match[1]) < 1) return raw;
  const [, year, month, day, time] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`)
    return raw;
  if (format === 'date') return time ? raw : `${day}.${month}.${year}`;
  if (!/^T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(time))
    return raw;
  return `${day}.${month}.${year} · ${time.slice(1).replace(/Z$/, ' UTC')}`;
}
