import { jsonFields } from './fields.ts';
/** Whitespace-only formatting. Numeric tokens and string escapes remain unchanged. */
export function formatTestJson(source: string) {
  jsonFields(source);
  const tokens = Array.from(
    source.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g),
    (match) => match[0],
  );
  let depth = 0,
    output = '';
  const line = () => '\n' + '  '.repeat(depth);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i],
      previous = tokens[i - 1],
      next = tokens[i + 1];
    if (token === '{' || token === '[') {
      output += token;
      if (next !== (token === '{' ? '}' : ']')) {
        depth++;
        output += line();
      }
    } else if (token === '}' || token === ']') {
      if (previous !== (token === '}' ? '{' : '[')) {
        depth--;
        output += line();
      }
      output += token;
    } else if (token === ',') output += ',' + line();
    else if (token === ':') output += ': ';
    else output += token;
  }
  if (new TextEncoder().encode(output).length > 512 * 1024) throw Error('test_pack_limit');
  return output;
}
