import { nodes as jsonNodes } from './json-viewer.js';

export const STRUCTURED_BYTES = 256 * 1024;
const NODE_LIMIT = 2000,
  DEPTH_LIMIT = 16;
const size = (text) => new TextEncoder().encode(text).byteLength;
const pointer = (text) => String(text).replaceAll('~', '~0').replaceAll('/', '~1');
export function fieldLabel(value) {
  return (
    String(value)
      .replace(/([a-zäöüß0-9])([A-ZÄÖÜ])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^./u, (character) => character.toLocaleUpperCase('de-DE')) || '(leerer Feldname)'
  );
}
export function structuredFormat({ mimeType = '', filename = '' } = {}) {
  const mime = String(mimeType).split(';')[0].trim().toLowerCase();
  if (/^(?:application\/(?:[a-z0-9.-]+\+)?json)$/.test(mime)) return 'json';
  if (/^(?:application\/(?:[a-z0-9.-]+\+)?xml|text\/xml)$/.test(mime)) return 'xml';
  if (!mime || mime === 'text/plain' || mime === 'application/octet-stream') {
    if (/\.json$/i.test(filename)) return 'json';
    if (/\.xml$/i.test(filename)) return 'xml';
  }
  return null;
}
function jsonModel(text) {
  const flat = jsonNodes(text);
  if (!flat) {
    try {
      JSON.parse(text);
    } catch {
      return {
        status: 'invalid',
        message: 'Der Inhalt ist kein gültiges JSON. Der Quelltext bleibt unverändert verfügbar.',
      };
    }
    return {
      status: 'limited',
      message:
        'Die JSON-Struktur überschreitet die Darstellungsgrenzen (16 Ebenen oder 2.000 Einträge). Der Quelltext bleibt verfügbar.',
    };
  }
  const mapped = new Map();
  for (const entry of flat) {
    const parent = mapped.get(entry.parent);
    const key = parent?.type === 'array' ? String(parent.children.length) : entry.label;
    const node = {
      id: entry.id,
      depth: entry.depth,
      key: entry.label,
      label:
        entry.parent === null
          ? 'Dokument'
          : parent?.type === 'array'
            ? `Eintrag ${Number(key) + 1}`
            : fieldLabel(entry.label),
      path: parent ? `${parent.path}/${pointer(key)}` : '',
      namespace: null,
      type: entry.branch ? (entry.array ? 'array' : 'object') : entry.type,
      value: entry.type === 'string' ? JSON.parse(entry.value) : entry.branch ? '' : entry.value,
      children: [],
      duplicate: false,
    };
    mapped.set(entry.id, node);
    if (parent) parent.children.push(node);
  }
  for (const node of mapped.values()) {
    if (node.type !== 'object') continue;
    const counts = new Map();
    for (const child of node.children) counts.set(child.key, (counts.get(child.key) || 0) + 1);
    for (const child of node.children) child.duplicate = counts.get(child.key) > 1;
  }
  return { status: 'ready', root: mapped.get(0) };
}
function xmlModel(text, Parser) {
  // Never give DTD/entity declarations to the parser. Parsed nodes are never adopted into the UI DOM.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))
    return {
      status: 'blocked',
      message:
        'XML mit DTD- oder Entity-Deklarationen wird nur als Quelltext angezeigt. Externe Verweise werden nicht geladen.',
    };
  if (typeof Parser !== 'function')
    return {
      status: 'unsupported',
      message: 'Die XML-Formularansicht ist in dieser Umgebung nicht verfügbar.',
    };
  let document;
  try {
    document = new Parser().parseFromString(text, 'application/xml');
  } catch {
    return {
      status: 'invalid',
      message: 'Das XML konnte nicht gelesen werden. Der Quelltext bleibt verfügbar.',
    };
  }
  if (
    !document?.documentElement ||
    ['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].some(
      (namespace) => document.getElementsByTagNameNS(namespace, 'parsererror').length,
    ) ||
    document.documentElement.nodeName === 'parsererror'
  )
    return {
      status: 'invalid',
      message: 'Der Inhalt ist kein wohlgeformtes XML. Der Quelltext bleibt unverändert verfügbar.',
    };
  let count = 0;
  const node = (key, depth, path, namespace, type, value = '') => {
    if (depth > DEPTH_LIMIT || count >= NODE_LIMIT) throw new Error('structure_limit');
    const local = key.replace(/^@/, '').split(':').at(-1);
    const label = key.startsWith('#text')
      ? `Textabschnitt ${key.match(/\d+/)?.[0] || ''}`
      : namespace === 'http://www.w3.org/2000/xmlns/'
        ? `Namensraum ${local === 'xmlns' ? '(Standard)' : local}`
        : fieldLabel(local);
    return { id: count++, key, label, depth, path, namespace, type, value, children: [], duplicate: false };
  };
  function visit(element, depth, path) {
    const own = node(element.nodeName, depth, path, element.namespaceURI || null, 'element');
    for (const attribute of element.attributes)
      own.children.push(
        node(
          `@${attribute.name}`,
          depth + 1,
          `${path}/@${attribute.name}`,
          attribute.namespaceURI || null,
          'attribute',
          attribute.value,
        ),
      );
    const counts = new Map();
    let textIndex = 0;
    const hasElements = [...element.childNodes].some((child) => child.nodeType === 1);
    if (!element.attributes.length && !hasElements) {
      own.type = 'string';
      own.value = [...element.childNodes]
        .filter((child) => [3, 4].includes(child.nodeType))
        .map((child) => child.nodeValue)
        .join('');
      return own;
    }
    for (const child of element.childNodes) {
      if (child.nodeType === 1) {
        const index = (counts.get(child.nodeName) || 0) + 1;
        counts.set(child.nodeName, index);
        own.children.push(visit(child, depth + 1, `${path}/${child.nodeName}[${index}]`));
      } else if ([3, 4].includes(child.nodeType)) {
        own.children.push(
          node(
            `#text[${++textIndex}]`,
            depth + 1,
            `${path}/text()[${textIndex}]`,
            null,
            child.nodeType === 4 ? 'cdata' : child.nodeValue.trim() ? 'text' : 'whitespace',
            child.nodeValue,
          ),
        );
      }
    }
    return own;
  }
  try {
    return {
      status: 'ready',
      root: visit(document.documentElement, 0, `/${document.documentElement.nodeName}[1]`),
    };
  } catch {
    return {
      status: 'limited',
      message:
        'Die XML-Struktur überschreitet die Darstellungsgrenzen (16 Ebenen oder 2.000 Einträge). Der Quelltext bleibt verfügbar.',
    };
  }
}
export function parseStructuredData(text, format, Parser = globalThis.DOMParser) {
  if (typeof text !== 'string' || !['json', 'xml'].includes(format))
    return {
      status: 'unsupported',
      format,
      message: 'Eine Formularansicht steht für JSON und XML zur Verfügung.',
    };
  if (size(text) > STRUCTURED_BYTES)
    return {
      status: 'limited',
      format,
      message:
        'Die Formularansicht ist auf 256 KiB begrenzt. Der Quelltext und der Originaldownload bleiben verfügbar.',
    };
  const result = format === 'json' ? jsonModel(text) : xmlModel(text, Parser);
  let fields = 0;
  const count = (node) => {
    if (!node.children.length) {
      if (node.type !== 'whitespace') fields++;
    } else node.children.forEach(count);
  };
  if (result.root) count(result.root);
  return { ...result, format, fieldCount: fields };
}
export function filterStructuredData(root, query = '') {
  const needle = String(query).slice(0, 160).trim().toLocaleLowerCase('de-DE');
  if (!root || !needle) return root;
  function visit(node) {
    const children = node.children.map(visit).filter(Boolean);
    const matches = [node.label, node.key, node.path, node.value, node.namespace || ''].some((value) =>
      value.toLocaleLowerCase('de-DE').includes(needle),
    );
    if (matches) return { ...node, matched: true };
    return children.length ? { ...node, children, matched: false } : null;
  }
  return visit(root);
}
