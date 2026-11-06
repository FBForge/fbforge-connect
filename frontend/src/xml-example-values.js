import { fictionalValues } from './fictional-values.js';

export function xmlFieldHintText(name, annotation) {
  let hint = String(name || '').slice(0, 160);
  if (!annotation) return hint;
  const walker = annotation.ownerDocument.createTreeWalker(annotation, NodeFilter.SHOW_ALL);
  for (let visited = 0, node; visited < 32 && hint.length < 1024 && (node = walker.nextNode()); visited++)
    if (node.nodeType === 3 || node.nodeType === 4) hint += ' ' + node.nodeValue.slice(0, 1023 - hint.length);
  return hint;
}

export function xmlEnumerationNames(annotation, messageNames, tick) {
  if (!annotation) return [];
  const names = new Set();
  const elements = annotation.ownerDocument.createTreeWalker(annotation, NodeFilter.SHOW_ELEMENT);
  for (let element; (element = elements.nextNode());) {
    tick();
    const text = annotation.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ALL);
    let value = '',
      tooLong = false;
    for (let node; (node = text.nextNode());) {
      tick();
      if (node.nodeType !== 3 && node.nodeType !== 4) continue;
      if (value.length + node.nodeValue.length > 1024) {
        tooLong = true;
        break;
      }
      value += node.nodeValue;
    }
    if (!tooLong && messageNames.has(value.trim())) names.add(value.trim());
  }
  return [...names];
}

export function xmlValue(type, field = '') {
  const semantic = fictionalValues({ format: type === 'dateTime' ? 'date-time' : type }, field);
  if (['string', 'normalizedString', 'token', 'date', 'dateTime'].includes(type) && semantic.length)
    return semantic[0];
  const values = {
    language: 'de',
    Name: 'testwert',
    NCName: 'testwert',
    NMTOKEN: 'testwert',
    NMTOKENS: 'testwert',
    QName: 'testwert',
    boolean: 'false',
    positiveInteger: '1',
    negativeInteger: '-1',
    int: '0',
    integer: '0',
    long: '0',
    short: '0',
    byte: '0',
    unsignedInt: '0',
    unsignedLong: '0',
    unsignedShort: '0',
    unsignedByte: '0',
    nonNegativeInteger: '0',
    nonPositiveInteger: '0',
    decimal: '0',
    double: '0',
    float: '0',
    date: '2000-01-01',
    dateTime: '2000-01-01T00:00:00Z',
    time: '00:00:00Z',
    duration: 'P0D',
    dayTimeDuration: 'P0D',
    yearMonthDuration: 'P0D',
    gYear: '2000',
    gYearMonth: '2000-01',
    gMonth: '--01',
    gMonthDay: '--01-01',
    gDay: '---01',
    anyURI: 'https://example.org/',
    base64Binary: 'AA==',
    hexBinary: '00',
  };
  if (Object.hasOwn(values, type)) return values[type];
  if (['string', 'normalizedString', 'token'].includes(type)) return semantic[0] || 'Fiktive Testangabe';
  throw new Error('example_unavailable');
}
