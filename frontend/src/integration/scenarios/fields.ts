import { Parser } from 'saxen';
import { parseLocalXml } from '../../safe-xml.js';
import { invalid } from './model.ts';

export interface Field {
  path: string;
  label: string;
  raw: string;
  type: string;
  start?: number;
  end?: number;
}
const escapePointer = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');
export function fieldSnippet(value: string, limit: number) {
  let prefix = value.slice(0, limit);
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  return new TextDecoder().decode(new TextEncoder().encode(prefix));
}
export function jsonFields(source: string): Field[] {
  if (new TextEncoder().encode(source).length > 512 * 1024) invalid();
  JSON.parse(source);
  const tokens = Array.from(source.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g));
  let index = 0,
    count = 0;
  const fields: Field[] = [];
  function visit(path: string, depth: number) {
    if (++count > 5000 || depth > 64) invalid();
    const token = tokens[index++];
    if (!token) invalid();
    if (token[0] === '{' || token[0] === '[') {
      const array = token[0] === '[',
        end = array ? ']' : '}',
        keys = new Set();
      let n = 0;
      while (tokens[index]?.[0] !== end) {
        const key = array ? String(n++) : JSON.parse(tokens[index++][0]);
        if (keys.has(key)) invalid();
        keys.add(key);
        if (!array) index++;
        visit(`${path}/${escapePointer(key)}`, depth + 1);
        if (tokens[index]?.[0] === ',') index++;
        else break;
      }
      if (tokens[index++]?.[0] !== end) invalid();
    } else {
      fields.push({
        path: path || '$',
        label: path || 'Gesamter Wert',
        raw: token[0],
        type:
          token[0][0] === '"'
            ? 'text'
            : ['true', 'false'].includes(token[0])
              ? 'boolean'
              : token[0] === 'null'
                ? 'null'
                : 'number',
        start: token.index,
        end: token.index! + token[0].length,
      });
    }
  }
  visit('', 0);
  if (index !== tokens.length) invalid();
  return fields;
}
interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  ns: Record<string, string>;
  content: (string | XmlNode)[];
}
export function expanded(name: string, ns: Record<string, string>, attribute = false) {
  const parts = name.split(':'),
    prefix = parts.length > 1 ? parts[0] : attribute ? '' : ns.xmlns || '';
  const uri = parts.length > 1 || !attribute ? ns[`${prefix}$uri`] || '' : '';
  return `{${uri}}${parts.at(-1)}`;
}
export function xmlTree(source: string): XmlNode {
  // The parser's attribute dictionary cannot retain this prototype key.
  if (/\s__proto__\s*=/.test(source)) invalid();
  parseLocalXml(source);
  const parser = new Parser({ proxy: true });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  parser.on('error', invalid);
  parser.on('warn', invalid);
  parser.on(
    'openTag',
    (
      el: { name: string; attrs: Record<string, string>; ns: Record<string, string> },
      decode: (s: string) => string,
    ) => {
      const attrs = Object.fromEntries(Object.entries(el.attrs).map(([k, v]) => [k, decode(v)]));
      // Keep original qualified names. Saxen namespace normalization removes an
      // attribute prefix when it aliases the element's default namespace.
      const ns: Record<string, string> = {
        ...(stack.at(-1)?.ns || { xml$uri: 'http://www.w3.org/XML/1998/namespace' }),
      };
      for (const [name, value] of Object.entries(attrs)) {
        if (name === 'xmlns') ns['$uri'] = value;
        else if (name.startsWith('xmlns:')) ns[`${name.slice(6)}$uri`] = value;
      }
      const qualified = [el.name, ...Object.keys(attrs).filter((k) => !k.startsWith('xmlns:'))];
      for (const name of qualified) if (name.includes(':') && !ns[`${name.split(':')[0]}$uri`]) invalid();
      const expandedAttributes = Object.keys(attrs)
        .filter((k) => k !== 'xmlns' && !k.startsWith('xmlns:'))
        .map((k) => expanded(k, ns, true));
      if (new Set(expandedAttributes).size !== expandedAttributes.length) invalid();
      const node: XmlNode = {
        name: el.name,
        attrs,
        ns,
        content: [],
      };
      if (stack.length) stack.at(-1)!.content.push(node);
      else root = node;
      stack.push(node);
    },
  );
  parser.on('closeTag', () => stack.pop());
  function text(value: string) {
    const content = stack.at(-1)?.content;
    if (!content) return;
    if (typeof content.at(-1) === 'string') content[content.length - 1] += value;
    else content.push(value);
  }
  parser.on('text', (value: string, decode: (s: string) => string) => text(decode(value)));
  parser.on('cdata', text);
  parser.parse(source);
  if (!root) invalid();
  return root;
}
const xmlEscape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\r', '&#13;');
function serialize(node: XmlNode): string {
  return `<${node.name}${Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${xmlEscape(v)}"`)
    .join(
      '',
    )}>${node.content.map((c) => (typeof c === 'string' ? xmlEscape(c) : serialize(c))).join('')}</${node.name}>`;
}
function walkXml(root: XmlNode, visit: (field: Field, node: XmlNode, attr: string | null) => void) {
  function walk(node: XmlNode, path: string) {
    for (const [key, value] of Object.entries(node.attrs))
      if (key !== 'xmlns' && !key.startsWith('xmlns:'))
        visit(
          {
            path: `${path}/@${encodeURIComponent(expanded(key, node.ns, true))}`,
            label: `${node.name} · ${key}`,
            raw: JSON.stringify(value),
            type: 'text',
          },
          node,
          key,
        );
    if (node.content.every((c) => typeof c === 'string'))
      visit(
        {
          path: `${path}/text()`,
          label: node.name,
          raw: JSON.stringify(node.content.join('')),
          type: 'text',
        },
        node,
        null,
      );
    const counts = new Map<string, number>();
    for (const child of node.content)
      if (typeof child !== 'string') {
        const name = expanded(child.name, child.ns),
          n = (counts.get(name) || 0) + 1;
        counts.set(name, n);
        walk(child, `${path}/${encodeURIComponent(name)}[${n}]`);
      }
  }
  walk(root, `/${encodeURIComponent(expanded(root.name, root.ns))}[1]`);
}
export function messageFields(source: string, mime: string): Field[] {
  if (mime === 'application/json') return jsonFields(source);
  if (mime !== 'application/xml') invalid();
  const rows: Field[] = [];
  walkXml(xmlTree(source), (row) => rows.push(row));
  return rows;
}
export function replaceField(source: string, mime: string, path: string, raw: string) {
  if (mime === 'application/json') {
    const field = jsonFields(source).find((f) => f.path === path);
    if (!field) invalid();
    JSON.parse(raw);
    return source.slice(0, field.start) + raw + source.slice(field.end);
  }
  const root = xmlTree(source);
  let found = false;
  walkXml(root, (field, node, attr) => {
    if (field.path !== path) return;
    found = true;
    const value = JSON.parse(raw);
    if (typeof value !== 'string') invalid();
    if (attr) node.attrs[attr] = value;
    else node.content = [value];
  });
  if (!found) invalid();
  const value = serialize(root);
  parseLocalXml(value);
  return value;
}
export function structuralXml(source: string): string {
  const canonical = (node: XmlNode): unknown => [
    expanded(node.name, node.ns),
    Object.entries(node.attrs)
      .filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:'))
      .map(([k, v]) => [expanded(k, node.ns, true), v])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    node.content.map((c) => (typeof c === 'string' ? c : canonical(c))),
  ];
  return JSON.stringify(canonical(xmlTree(source)));
}

/** Mask only scalar leaves already proven by field conditions. Containers stay intact. */
export function maskFields(source: string, mime: string, paths: Set<string>) {
  if (mime === 'application/json') {
    let output = source;
    const fields = jsonFields(source)
      .filter((field) => paths.has(field.path))
      .sort((a, b) => b.start! - a.start!);
    for (const field of fields) output = output.slice(0, field.start) + 'null' + output.slice(field.end);
    return output;
  }
  const root = xmlTree(source);
  walkXml(root, (field, node, attr) => {
    if (!paths.has(field.path)) return;
    if (attr) node.attrs[attr] = 'fbforge-proven-field';
    else node.content = ['fbforge-proven-field'];
  });
  return serialize(root);
}
