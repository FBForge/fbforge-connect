// Local fictional schema examples. No schema or form content is executed.
export function jsonExample(schema) {
  const documents = schema?.schemaPackage === 1 ? schema.documents : {};
  const base = schema?.schemaPackage === 1 ? schema.schemaUri : '';
  const root = base ? documents?.[base.split('#')[0]] : schema;
  if (root === undefined) throw new Error('Das Root-Schema fehlt.');
  const selected = base.includes('#') ? jsonReference(root, `#${base.split('#').slice(1).join('#')}`) : root;
  if (selected === undefined) throw new Error('Die gewählte Schema-Referenz fehlt.');
  return JSON.stringify(
    jsonValue(selected, root, { field: '', depth: 0, budget: { remaining: 2000 }, documents, base }),
    null,
    2,
  );
}
function jsonValue(schema, root, context) {
  if (--context.budget.remaining < 0 || context.depth > 24)
    throw new Error('Die Grenze für ein Beispiel wurde erreicht. Das Schema ist zu groß oder rekursiv.');
  if (schema === true) return {};
  if (schema === false) throw new Error('Das JSON-Schema „false“ erlaubt keine gültigen Daten.');
  if (!schema || typeof schema !== 'object') return null;
  const next = { ...context, depth: context.depth + 1 };
  if (typeof schema.$id === 'string' && next.base) next.base = new URL(schema.$id, next.base).href;
  if (typeof schema.$ref === 'string') {
    const uri = next.base ? new URL(schema.$ref, next.base).href : schema.$ref;
    const location = uri.split('#')[0];
    const target = location && location !== next.base?.split('#')[0] ? context.documents?.[location] : root;
    const referenced =
      target === undefined
        ? undefined
        : jsonReference(target, uri.includes('#') ? `#${uri.split('#').slice(1).join('#')}` : '#');
    if (referenced === undefined) throw new Error('Eine Schema-Referenz kann nicht lokal aufgelöst werden.');
    const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'));
    return jsonValue(typeof referenced === 'object' ? { ...referenced, ...siblings } : referenced, target, {
      ...next,
      base: uri,
    });
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length) return jsonAllOf(schema.allOf, root, next);
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return jsonValue(schema.oneOf[0], root, next);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return jsonValue(schema.anyOf[0], root, next);
  const declaredType =
    schema.type || (schema.properties ? 'object' : schema.items || schema.prefixItems ? 'array' : 'string');
  const type = Array.isArray(declaredType)
    ? declaredType.find((item) => item !== 'null') || declaredType[0]
    : declaredType;
  const preferred = jsonPreferredValue(schema, schema.type);
  if (preferred !== undefined) return preferred;
  if (type === 'object') {
    const object = {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const names = [...new Set([...required, ...Object.keys(schema.properties || {})])];
    if (Number.isInteger(schema.maxProperties) && required.size > schema.maxProperties)
      throw new Error('Die erforderlichen Felder widersprechen der Objekt-Grenze.');
    const selected = Number.isInteger(schema.maxProperties) ? names.slice(0, schema.maxProperties) : names;
    for (const name of selected)
      Object.defineProperty(object, name, {
        value: jsonValue(schema.properties?.[name] ?? {}, root, { ...next, field: name }),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return object;
  }
  if (type === 'array') {
    const tuple = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : []);
    const minimum = Number.isInteger(schema.minItems) ? schema.minItems : 0;
    let count = Math.max(minimum, tuple.length, schema.items && !Array.isArray(schema.items) ? 1 : 0);
    if (Number.isInteger(schema.maxItems)) count = Math.min(count, schema.maxItems);
    if (count < minimum || count < 0 || count > 100)
      throw new Error('Die Array-Grenze für ein Beispiel wurde erreicht.');
    const items = Array.from({ length: count }, (_, index) =>
      jsonValue(
        tuple[index] ?? (Array.isArray(schema.items) ? (schema.additionalItems ?? {}) : (schema.items ?? {})),
        root,
        next,
      ),
    );
    if (schema.uniqueItems && new Set(items.map((item) => JSON.stringify(item))).size !== items.length)
      throw new Error('Für dieses Array konnten keine unterschiedlichen Beispielwerte erzeugt werden.');
    return items;
  }
  if (type === 'integer') return integerExample(schema);
  if (type === 'number') return numberExample(schema);
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return stringExample(schema, context.field);
}
function jsonPreferredValue(schema, type) {
  const allowed = (value) =>
    jsonMatchesType(value, type) &&
    (!Array.isArray(schema.enum) ||
      schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) &&
    (typeof value !== 'string' ||
      (value.length >= (schema.minLength || 0) &&
        value.length <= (schema.maxLength ?? Infinity) &&
        matchesJsonPattern(value, schema.pattern || '') &&
        matchesExampleFormat(value, schema.format)));
  if (Object.hasOwn(schema, 'const')) {
    if (!allowed(schema.const)) throw new Error('Die Schema-Konstante widerspricht den Feldvorgaben.');
    return schema.const;
  }
  const candidates = [];
  if (Object.hasOwn(schema, 'default')) candidates.push(schema.default);
  if (Array.isArray(schema.examples)) candidates.push(...schema.examples);
  if (Array.isArray(schema.enum)) {
    if (schema.format === 'bool')
      candidates.push(...schema.enum.filter((value) => value === false || value === 'false'));
    candidates.push(...schema.enum);
  }
  const value = candidates.find(allowed);
  if (value === undefined && Array.isArray(schema.enum))
    throw new Error('Kein erlaubter Auswahlwert erfüllt die Feldvorgaben.');
  return value;
}
function jsonMatchesType(value, type) {
  if (!type) return true;
  if (Array.isArray(type)) return type.some((item) => jsonMatchesType(value, item));
  return (
    {
      object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
      array: Array.isArray,
      integer: Number.isInteger,
      number: (value) => typeof value === 'number' && Number.isFinite(value),
      boolean: (value) => typeof value === 'boolean',
      null: (value) => value === null,
      string: (value) => typeof value === 'string',
    }[type]?.(value) || false
  );
}
function jsonReference(root, reference) {
  if (reference === '#') return root;
  if (reference.startsWith('#') && !reference.startsWith('#/')) {
    const pending = [root];
    let remaining = 20000;
    while (pending.length && --remaining > 0) {
      const item = pending.pop();
      if (!item || typeof item !== 'object') continue;
      if (item.$anchor === reference.slice(1) || item.$dynamicAnchor === reference.slice(1)) return item;
      pending.push(...Object.values(item));
    }
    return undefined;
  }
  if (!reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .reduce((value, part) => {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      return value && Object.hasOwn(value, key) ? value[key] : undefined;
    }, root);
}
function jsonAllOf(parts, root, context) {
  const values = parts.map((part) => jsonValue(part, root, context));
  return values.every((value) => value && typeof value === 'object' && !Array.isArray(value))
    ? Object.fromEntries(values.flatMap((value) => Object.entries(value)))
    : values[0];
}
function integerExample(schema) {
  return Math.ceil(numberExample(schema, true));
}
function numberExample(schema, integer = false) {
  let value = Number.isFinite(schema.minimum) ? schema.minimum : 0;
  if (Number.isFinite(schema.exclusiveMinimum))
    value = Math.max(value, schema.exclusiveMinimum + (integer ? 1 : 0.1));
  if (Number.isFinite(schema.multipleOf) && schema.multipleOf > 0)
    value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
  if (Number.isFinite(schema.maximum) && value > schema.maximum)
    throw new Error('Numerische Schema-Grenzen sind nicht erfüllbar.');
  if (Number.isFinite(schema.exclusiveMaximum) && value >= schema.exclusiveMaximum)
    throw new Error('Numerische Schema-Grenzen sind nicht erfüllbar.');
  return value;
}
function fictionalValues(schema, field = '') {
  const normalize = (text) =>
    String(text || '')
      .slice(0, 512)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .toLowerCase();
  const label = normalize(`${schema.title || ''} ${field}`);
  const hint = label.trim() || normalize(schema.description);
  const timestamp = schema.format === 'datetime' || schema.format === 'date-time';
  if (/geburtsdatum|birth.?date|date.?of.?birth|\bdob\b/.test(hint))
    return timestamp ? ['1985-04-12T00:00:00Z'] : ['1985-04-12', '12.04.1985'];
  if (/geburtsname|maiden.?name/.test(hint)) return ['Beispiel'];
  if (/vorname|first.?name|given.?name/.test(hint)) return ['Erika', 'Anna', 'Li'];
  if (/familienname|nachname|surname|last.?name/.test(hint)) return ['Mustermann'];
  if (/e.?mail/.test(hint)) return ['erika.mustermann@example.invalid'];
  if (/telefon|phone|mobile|mobilnummer|fax/.test(hint))
    return ['+49 30 00000000', '+493000000000', '03000000000'];
  if (/postleitzahl|\bplz\b|postal.?code|post.?code|zip.?code/.test(hint)) return ['12345'];
  if (/hausnummerzusatz|house.?number.?suffix/.test(hint)) return ['a'];
  if (/hausnummer|house.?number/.test(hint)) return ['12'];
  if (/strasse|street/.test(hint)) return ['Musterstraße'];
  if (/geburtsort|wohnort|stadt|city|\bort\b|place.?of.?birth/.test(hint)) return ['Musterstadt'];
  if (/bundesland|federal.?state/.test(hint)) return ['Berlin'];
  if (/staatsangehorigkeit|nationality/.test(hint)) return ['deutsch', 'DE'];
  if (/\bland\b|country/.test(hint)) return ['Deutschland', 'DE'];
  if (/firma|unternehmen|organisation|organization|einrichtung|company/.test(hint))
    return ['Musterorganisation'];
  if (/\btitel\b|salutation/.test(hint)) return ['Dr.'];
  if (/\bname\b|full.?name/.test(hint)) return ['Erika Mustermann'];
  if (/datum|\bdate\b|zeitpunkt/.test(hint))
    return timestamp ? ['2025-06-18T10:30:00Z'] : ['2025-06-18', '18.06.2025'];
  if (/uhrzeit|\btime\b/.test(hint)) return ['10:30'];
  return schema.description ? fictionalValues({ title: schema.description, format: schema.format }) : [];
}
function stringExample(schema, field = '') {
  const pattern = String(schema.pattern || '');
  const maxLength = Number.isInteger(schema.maxLength) ? schema.maxLength : Infinity;
  const minLength = Number.isInteger(schema.minLength) ? schema.minLength : 0;
  const format = {
    'date-time': '2025-06-18T10:30:00Z',
    datetime: '2025-06-18T10:30:00Z',
    date: '2025-06-18',
    time: '10:30:00Z',
    email: 'erika.mustermann@example.invalid',
    'idn-email': 'erika.mustermann@example.invalid',
    uri: 'https://example.org/test',
    'uri-reference': 'https://example.org/test',
    iri: 'https://example.org/test',
    'iri-reference': 'https://example.org/test',
    uuid: '11111111-1111-4111-8111-111111111111',
    ipv4: '192.0.2.1',
    ipv6: '2001:db8::1',
    hostname: 'example.org',
    'idn-hostname': 'example.org',
    bool: 'false',
  }[schema.format];
  const semantic = fictionalValues(schema, field);
  const candidates = [
    ...semantic,
    format,
    pattern.includes('@') ? 'erika.mustermann@example.invalid' : null,
    pattern.includes(':') ? '10:30' : null,
    'Fiktive Testangabe',
    'Test',
    '+493000000000',
    '12',
    '12345',
    '1',
    '0',
    '00',
    '00000',
    '10000',
    'A',
    'a',
    'false',
    '11111111-1111-4111-8111-111111111111',
    '1985-04-12',
    '2025-06-18T10:30:00Z',
    '',
  ];
  if (Number.isFinite(maxLength) && maxLength >= minLength)
    candidates.push(...semantic.map((value) => value.slice(0, maxLength)));
  if (minLength <= maxLength && minLength <= 10000)
    candidates.push('a'.repeat(minLength), '0'.repeat(minLength));
  for (const candidate of candidates)
    if (
      typeof candidate === 'string' &&
      candidate.length >= minLength &&
      candidate.length <= maxLength &&
      matchesJsonPattern(candidate, pattern) &&
      matchesExampleFormat(candidate, schema.format)
    )
      return candidate;
  throw new Error(
    `Für dieses String-Feld konnte kein gültiger Beispielwert erzeugt werden: ${field || schema.title || pattern.slice(0, 120)}`,
  );
}
function matchesExampleFormat(value, format) {
  if (format === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (format === 'date-time' || format === 'datetime')
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (format === 'email' || format === 'idn-email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return true;
}
function matchesJsonPattern(value, pattern) {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, 'u').test(value);
  } catch (_) {
    try {
      return new RegExp(pattern).test(value);
    } catch (_) {
      return false;
    }
  }
}

export function xmlExample(schemas, schemaLocation, requestedRoot, stringValue) {
  if (
    schemas.length > 512 ||
    schemas.some((entry) => entry.text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(entry.text))
  )
    throw new Error('XSD ist nicht geeignet.');
  const parser = new DOMParser();
  const index = {
    elements: new Map(),
    types: new Map(),
    namespaces: new Map(),
    roots: [],
    remaining: 2000,
    stringValue,
  };
  const hasProductionTree = schemas.some((entry) => entry.name.startsWith('xsd/'));
  const orderedSchemas = schemas
    .filter((entry) => /\.xsd$/i.test(entry.name) && (!hasProductionTree || entry.name.startsWith('xsd/')))
    .sort(
      (left, right) =>
        Number(left.name.startsWith('xsd_dev/')) - Number(right.name.startsWith('xsd_dev/')) ||
        left.name.localeCompare(right.name),
    );
  for (const entry of orderedSchemas) {
    const document = parser.parseFromString(entry.text, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('XSD ist nicht wohlgeformt.');
    const schema = document.documentElement;
    const namespace = schema.getAttribute('targetNamespace') || '';
    for (const definition of directChildren(schema)) {
      const name = definition.getAttribute('name');
      if (!name) continue;
      if (definition.localName === 'element' && !index.elements.has(xmlKey(namespace, name))) {
        index.elements.set(xmlKey(namespace, name), definition);
        index.roots.push({
          namespace,
          name,
          primary: entry.primary !== false,
          label: namespace ? `${name} · ${namespace}` : name,
        });
      }
      if (
        (definition.localName === 'complexType' || definition.localName === 'simpleType') &&
        !index.types.has(xmlKey(namespace, name))
      )
        index.types.set(xmlKey(namespace, name), definition);
      index.namespaces.set(definition, namespace);
    }
  }
  if (!index.roots.length) throw new Error('XSD enthält kein globales Root-Element.');
  const fragment = String(schemaLocation || '').split('#')[1];
  const matching = fragment
    ? index.roots.filter((root) => root.name === fragment || root.name === fragment.split(':').pop())
    : [];
  const rootDefinition =
    requestedRoot ||
    (matching.length === 1 ? matching[0] : index.roots.find((root) => root.primary) || index.roots[0]);
  const output = window.document.implementation.createDocument(
    rootDefinition.namespace || null,
    rootDefinition.name,
    null,
  );
  const root = output.documentElement;
  if (rootDefinition.namespace) root.setAttribute('xmlns', rootDefinition.namespace);
  addSchemaLocation(root, rootDefinition.namespace, schemaLocation);
  populateXmlElement(
    output,
    root,
    index.elements.get(xmlKey(rootDefinition.namespace, rootDefinition.name)),
    index,
    new Set(),
    0,
  );
  return {
    data: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(output)}`,
    roots: index.roots,
  };
}
function directChildren(element) {
  return [...element.childNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
}
function xmlKey(namespace, name) {
  return `${namespace || ''}\u0000${name}`;
}
function xmlLocalName(value) {
  return String(value || '')
    .split(':')
    .pop();
}
function xmlSchemaNamespace(index, element) {
  return (
    index.namespaces.get(element) ||
    element.ownerDocument.documentElement.getAttribute('targetNamespace') ||
    ''
  );
}
function xmlResolveKey(index, context, lexicalName) {
  const [prefix] = String(lexicalName).includes(':') ? String(lexicalName).split(':', 1) : [null];
  return xmlKey(
    prefix ? context.lookupNamespaceURI(prefix) || '' : xmlSchemaNamespace(index, context),
    xmlLocalName(lexicalName),
  );
}
function xmlChild(element, name) {
  return directChildren(element).find((child) => child.localName === name);
}
function populateXmlElement(output, target, definition, index, activeTypes, depth) {
  if (--index.remaining < 0 || depth >= 16)
    throw new Error('Die Grenze für ein XML-Beispiel wurde erreicht.');
  if (!definition) throw new Error('Eine XSD-Referenz fehlt.');
  const fixed = definition.getAttribute('fixed');
  const defaultValue = definition.getAttribute('default');
  if (fixed || defaultValue) {
    target.textContent = fixed || defaultValue;
    return;
  }
  const ref = definition.getAttribute('ref');
  const referenced = ref && index.elements.get(xmlResolveKey(index, definition, ref));
  if (referenced) return populateXmlElement(output, target, referenced, index, activeTypes, depth + 1);
  let type = xmlChild(definition, 'complexType') || xmlChild(definition, 'simpleType');
  const namedType = definition.getAttribute('type');
  if (!type && namedType) type = index.types.get(xmlResolveKey(index, definition, namedType));
  if (!type) {
    target.textContent = xmlValue(xmlLocalName(namedType), xmlFieldHint(definition));
    return;
  }
  if (type.localName === 'simpleType') {
    target.textContent = xmlSimpleValue(type, xmlFieldHint(definition), index.stringValue);
    return;
  }
  const identity = xmlKey(xmlSchemaNamespace(index, type), type.getAttribute('name'));
  if (type.getAttribute('name') && activeTypes.has(identity)) return;
  if (type.getAttribute('name')) activeTypes.add(identity);
  const complexContent = xmlChild(type, 'complexContent');
  if (complexContent) {
    const derivation = xmlChild(complexContent, 'extension') || xmlChild(complexContent, 'restriction');
    const base = derivation?.getAttribute('base');
    const baseType = base && index.types.get(xmlResolveKey(index, derivation, base));
    if (baseType) populateXmlType(output, target, baseType, index, activeTypes, depth + 1);
    if (derivation) populateXmlType(output, target, derivation, index, activeTypes, depth + 1);
  } else populateXmlType(output, target, type, index, activeTypes, depth + 1);
  if (type.getAttribute('name')) activeTypes.delete(identity);
}
function populateXmlType(output, target, type, index, activeTypes, depth) {
  if (--index.remaining < 0 || depth >= 16)
    throw new Error('Die Grenze für ein XML-Beispiel wurde erreicht.');
  addXmlAttributes(target, type);
  const container = ['sequence', 'all', 'choice'].map((name) => xmlChild(type, name)).find(Boolean);
  if (!container) return;
  for (const child of directChildren(container)) {
    if (child.localName !== 'element' || child.getAttribute('minOccurs') === '0') continue;
    const ref = child.getAttribute('ref');
    const name = child.getAttribute('name') || xmlLocalName(ref);
    if (!name) continue;
    const namespace = xmlElementNamespace(index, child, type);
    const element = namespace ? output.createElementNS(namespace, name) : output.createElement(name);
    if (!namespace && target.namespaceURI)
      element.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', '');
    target.append(element);
    populateXmlElement(output, element, child, index, activeTypes, depth + 1);
    if (container.localName === 'choice') break;
  }
}
function xmlElementNamespace(index, element, type) {
  const ref = element.getAttribute('ref');
  if (ref) return xmlResolveKey(index, element, ref).split('\u0000')[0];
  if (element.getAttribute('form') === 'unqualified') return '';
  if (element.getAttribute('form') === 'qualified') return xmlSchemaNamespace(index, type);
  return element.ownerDocument.documentElement.getAttribute('elementFormDefault') === 'qualified'
    ? xmlSchemaNamespace(index, type)
    : '';
}
function addXmlAttributes(target, type) {
  for (const attribute of directChildren(type))
    if (
      attribute.localName === 'attribute' &&
      attribute.getAttribute('use') === 'required' &&
      attribute.getAttribute('name')
    )
      target.setAttribute(
        attribute.getAttribute('name'),
        attribute.getAttribute('fixed') ||
          attribute.getAttribute('default') ||
          xmlValue(xmlLocalName(attribute.getAttribute('type'))),
      );
}
function xmlFieldHint(element) {
  const annotation = xmlChild(element, 'annotation');
  return `${element.getAttribute('name') || ''} ${annotation?.textContent || ''}`;
}
function xmlSimpleValue(type, field = '', stringValue) {
  const restriction = xmlChild(type, 'restriction');
  const enumeration =
    restriction && directChildren(restriction).find((child) => child.localName === 'enumeration');
  if (enumeration) return enumeration.getAttribute('value');
  if (!restriction) return fictionalValues({}, field)[0] || 'Fiktive Testangabe';
  const constraints = { type: 'string' };
  for (const facet of directChildren(restriction)) {
    if (facet.localName === 'pattern') constraints.pattern = facet.getAttribute('value');
    if (facet.localName === 'minLength') constraints.minLength = Number(facet.getAttribute('value'));
    if (facet.localName === 'maxLength') constraints.maxLength = Number(facet.getAttribute('value'));
    if (facet.localName === 'length')
      constraints.minLength = constraints.maxLength = Number(facet.getAttribute('value'));
  }
  if (Object.keys(constraints).length === 1)
    return xmlValue(xmlLocalName(restriction.getAttribute('base')), field);
  // Schema patterns are untrusted. The caller evaluates these only in a terminable worker.
  if (!stringValue) throw new Error('Für XSD-Einschränkungen wird der lokale Beispiel-Worker benötigt.');
  return stringValue(constraints, field);
}
function xmlValue(type, field = '') {
  const semantic = fictionalValues({ format: type === 'dateTime' ? 'date-time' : type }, field);
  if (['string', 'normalizedString', 'token', 'date', 'dateTime'].includes(type) && semantic.length)
    return semantic[0];
  return (
    {
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
    }[type] ||
    semantic[0] ||
    'Fiktive Testangabe'
  );
}
function addSchemaLocation(root, namespace, schemaLocation) {
  if (!schemaLocation) return;
  const xsi = 'http://www.w3.org/2001/XMLSchema-instance';
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', xsi);
  if (namespace) root.setAttributeNS(xsi, 'xsi:schemaLocation', `${namespace} ${schemaLocation}`);
  else root.setAttributeNS(xsi, 'xsi:noNamespaceSchemaLocation', schemaLocation);
}
