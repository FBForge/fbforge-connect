/** Display only supplied names or exact FIM catalogue matches. Never guess a LeiKa title. */
export function serviceLabel(identifier, name) {
  const id = typeof identifier === 'string' ? identifier.trim() : '';
  const supplied = typeof name === 'string' ? name.trim() : '';
  const leika = /^urn:de:fim:leika:leistung:(\d+)$/i.exec(id)?.[1];
  const title = supplied && supplied !== id ? supplied : '';
  return {
    title: title || (leika ? `Leistung ${leika}` : id || 'Leistung nicht angegeben'),
    identifier: id,
    code: leika || id,
    hasName: Boolean(title),
    option: title && id ? `${title} · ${leika || id}` : title || id,
  };
}
