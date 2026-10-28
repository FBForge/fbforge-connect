import { resolveUri } from './schema-hints.js';
const XSD = 'http://www.w3.org/2001/XMLSchema';

// Parse only bounded schema documents. DTDs and entity declarations remain forbidden.
export function readAnnotationSchemas(packet, Parser, tick) {
  if (typeof Parser !== 'function' || !packet.schemas.length || packet.schemas.length > 512)
    throw new Error('unsupported_xsd');
  const files = new Map();
  let tags = 0;
  for (const row of packet.schemas) {
    tick();
    if (
      !row ||
      typeof row.name !== 'string' ||
      typeof row.text !== 'string' ||
      /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(row.text)
    )
      throw new Error('invalid_xsd');
    for (const character of row.text)
      if (character === '<' && ++tags > 40000) throw new Error('schema_view_limit');
    const uri = resolveUri(row.name, packet.schemaUri);
    if (!uri || files.has(uri)) throw new Error('ambiguous_xsd');
    const doc = new Parser().parseFromString(row.text, 'application/xml');
    if (
      !doc.documentElement ||
      ['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].some(
        (ns) => doc.getElementsByTagNameNS(ns, 'parsererror').length,
      ) ||
      doc.documentElement.namespaceURI !== XSD ||
      doc.documentElement.localName !== 'schema'
    )
      throw new Error('invalid_xsd');
    files.set(uri, {
      uri,
      root: doc.documentElement,
      namespace: doc.documentElement.getAttribute('targetNamespace') || '',
      primary: row.primary !== false,
    });
  }
  return files;
}
