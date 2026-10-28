import { Parser } from 'saxen';

export function parseLocalXml(text, limit = 512 * 1024) {
  const invalid = () => {
    throw new Error('xml_invalid');
  };
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    new TextEncoder().encode(text).length > limit ||
    /<!\s*(?:DOCTYPE|ENTITY)|<\?\s*(?!xml(?:\s|\?>))/i.test(text)
  )
    invalid();
  const parser = new Parser({ proxy: true });
  parser.ns({ 'http://www.w3.org/2001/XMLSchema': 'xs' });
  const stack = [];
  let root,
    count = 0;
  parser.on('error', invalid);
  parser.on('warn', invalid);
  parser.on('openTag', (element, decode) => {
    if (++count > 5000 || stack.length > 64 || Object.keys(element.attrs).length > 128) invalid();
    const node = {
      name: element.name,
      attrs: Object.fromEntries(Object.entries(element.attrs).map(([key, value]) => [key, decode(value)])),
      ns: { ...element.ns },
      children: [],
      text: '',
    };
    if (stack.length) stack.at(-1).children.push(node);
    else if (root) invalid();
    else root = node;
    stack.push(node);
  });
  parser.on('closeTag', () => stack.pop());
  parser.on('text', (value, decode) => {
    if (stack.length) stack.at(-1).text += decode(value);
    else if (value.trim()) invalid();
  });
  parser.on('cdata', (value) => {
    if (stack.length) stack.at(-1).text += value;
    else invalid();
  });
  try {
    parser.parse(text);
  } catch {
    invalid();
  }
  if (!root || stack.length) invalid();
  return root;
}

export function expandedXmlName(value, ns) {
  const [prefix, local] = value.includes(':') ? value.split(':') : ['', value];
  const uri = ns[`${prefix || ns.xmlns || ''}$uri`] || '';
  return uri ? `{${uri}}${local}` : value;
}
