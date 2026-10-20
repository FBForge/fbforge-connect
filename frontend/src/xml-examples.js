import { fictionalValues } from './fictional-values.js';

const XSD = 'http://www.w3.org/2001/XMLSchema';
export const xmlMessageKey = (root) => JSON.stringify([root.namespace, root.name]);
export function xmlMessages(schemas, schemaLocation) {
  const roots = xmlCandidateRoots(xmlIndex(schemas).roots, schemaLocation);
  return { roots, selected: roots.length === 1 ? roots[0] : null };
}
function xmlCandidateRoots(roots, schemaLocation) {
  const fragment = String(schemaLocation || '').split('#')[1];
  if (!fragment) return roots;
  const matching = roots.filter((root) => root.name === fragment);
  if (!matching.length) throw new Error('example_unavailable');
  return matching;
}
function xmlIndex(schemas, stringValue) {
  if (
    !Array.isArray(schemas) ||
    !schemas.length ||
    schemas.length > 512 ||
    schemas.reduce((size, entry) => size + (entry?.text?.length || 0), 0) > 24 * 1024 * 1024 ||
    schemas.some(
      (entry) =>
        typeof entry?.name !== 'string' ||
        typeof entry.text !== 'string' ||
        entry.text.length > 2 * 1024 * 1024 ||
        /<!DOCTYPE|<!ENTITY/i.test(entry.text),
    )
  )
    throw new Error('schema_unavailable');
  const parser = new DOMParser();
  const index = {
    elements: new Map(),
    types: new Map(),
    groups: new Map(),
    attributes: new Map(),
    attributeGroups: new Map(),
    namespaces: new Map(),
    roots: [],
    remaining: 2000,
    stringValue,
  };
  const hasProductionTree = schemas.some((entry) => entry.name.startsWith('xsd/'));
  const orderedSchemas = schemas
    .filter((entry) => !hasProductionTree || entry.name.startsWith('xsd/'))
    .sort(
      (left, right) =>
        Number(left.name.startsWith('xsd_dev/')) - Number(right.name.startsWith('xsd_dev/')) ||
        left.name.localeCompare(right.name),
    );
  for (const entry of orderedSchemas) {
    const document = parser.parseFromString(entry.text, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('schema_unavailable');
    const schema = document.documentElement;
    if (schema.namespaceURI !== XSD || schema.localName !== 'schema') throw new Error('schema_unavailable');
    const namespace = schema.getAttribute('targetNamespace') || '';
    for (const definition of directChildren(schema)) {
      const name = definition.getAttribute('name');
      if (!name) continue;
      if (definition.localName === 'element' && !index.elements.has(xmlKey(namespace, name))) {
        index.elements.set(xmlKey(namespace, name), definition);
        if (!['true', '1'].includes(definition.getAttribute('abstract'))) {
          const annotation = xmlChild(definition, 'annotation');
          const title =
            annotation &&
            [...annotation.getElementsByTagNameNS('*', 'title')][0]?.textContent.trim().slice(0, 180);
          index.roots.push({
            namespace,
            name,
            primary: entry.primary !== false,
            label: title ? `${title} · ${name}` : name,
          });
        }
      }
      if (
        (definition.localName === 'complexType' || definition.localName === 'simpleType') &&
        !index.types.has(xmlKey(namespace, name))
      )
        index.types.set(xmlKey(namespace, name), definition);
      const table = new Map([
        ['group', index.groups],
        ['attribute', index.attributes],
        ['attributeGroup', index.attributeGroups],
      ]).get(definition.localName);
      if (table && !table.has(xmlKey(namespace, name))) table.set(xmlKey(namespace, name), definition);
      index.namespaces.set(definition, namespace);
    }
  }
  index.roots = index.roots.filter((root) => root.primary);
  if (!index.roots.length) throw new Error('example_unavailable');
  index.roots.sort(
    (left, right) =>
      left.label.localeCompare(right.label, 'de') || left.namespace.localeCompare(right.namespace),
  );
  const labelCounts = new Map();
  for (const root of index.roots) labelCounts.set(root.label, (labelCounts.get(root.label) || 0) + 1);
  for (const root of index.roots)
    if (labelCounts.get(root.label) > 1)
      root.label = `${root.label} · ${root.namespace || 'ohne Namensraum'}`;
  return index;
}
export function xmlExample(schemas, schemaLocation, requestedRoot, stringValue) {
  const index = xmlIndex(schemas, stringValue);
  const candidates = xmlCandidateRoots(index.roots, schemaLocation);
  const rootDefinition = requestedRoot
    ? candidates.find(
        (root) => root.name === requestedRoot.name && root.namespace === requestedRoot.namespace,
      )
    : candidates.length === 1
      ? candidates[0]
      : null;
  if (!rootDefinition) throw new Error(requestedRoot ? 'example_unavailable' : 'xml_message_required');
  index.root = rootDefinition;
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
  const data = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(output)}`;
  if (data.length > 2 * 1024 * 1024) throw new Error('example_unavailable');
  return {
    data,
    roots: candidates,
  };
}
function directChildren(element) {
  return [...element.childNodes].filter(
    (node) => node.nodeType === Node.ELEMENT_NODE && node.namespaceURI === XSD,
  );
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
    context.lookupNamespaceURI(prefix) || (prefix ? '' : xmlSchemaNamespace(index, context)),
    xmlLocalName(lexicalName),
  );
}
function xmlChild(element, name) {
  return directChildren(element).find((child) => child.localName === name);
}
function xmlBudget(index, depth) {
  if (--index.remaining < 0 || depth >= 64) throw new Error('example_unavailable');
}
function populateXmlElement(output, target, definition, index, activeTypes, depth) {
  xmlBudget(index, depth);
  if (!definition) throw new Error('example_unavailable');
  const ref = definition.getAttribute('ref');
  if (ref)
    return populateXmlElement(
      output,
      target,
      index.elements.get(xmlResolveKey(index, definition, ref)),
      index,
      activeTypes,
      depth + 1,
    );
  const type = xmlChild(definition, 'complexType') || xmlChild(definition, 'simpleType');
  const namedType = definition.getAttribute('type');
  const resolved = type || (namedType && index.types.get(xmlResolveKey(index, definition, namedType)));
  if (resolved && ['true', '1'].includes(resolved.getAttribute('abstract')))
    throw new Error('example_unavailable');
  if (resolved?.localName === 'complexType')
    populateXmlType(output, target, resolved, index, activeTypes, depth + 1);
  else if (definition.hasAttribute('fixed') || definition.hasAttribute('default'))
    target.textContent = definition.getAttribute('fixed') ?? definition.getAttribute('default');
  else
    target.textContent = resolved
      ? xmlSimpleValue(resolved, xmlFieldHint(definition), index, depth + 1)
      : xmlBuiltinValue(index, definition, namedType, xmlFieldHint(definition));
  if (definition.hasAttribute('fixed') || definition.hasAttribute('default'))
    target.textContent = definition.getAttribute('fixed') ?? definition.getAttribute('default');
}
function xmlBuiltinValue(index, context, name, field) {
  // An unresolved application type is not a string. Do not invent a value for a missing import.
  if (
    !name ||
    xmlResolveKey(index, context, name).split('\u0000')[0] !== XSD ||
    ['anyType', 'anySimpleType'].includes(xmlLocalName(name))
  )
    throw new Error('example_unavailable');
  if (xmlLocalName(name) === 'ID') return `test-id-${2000 - index.remaining}`;
  if (['IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NOTATION'].includes(xmlLocalName(name)))
    throw new Error('example_unavailable');
  return xmlValue(xmlLocalName(name), field);
}
function populateXmlType(output, target, type, index, activeTypes, depth) {
  xmlBudget(index, depth);
  if (activeTypes.has(type)) throw new Error('example_unavailable');
  activeTypes.add(type);
  try {
    const complex = xmlChild(type, 'complexContent'),
      simple = xmlChild(type, 'simpleContent');
    const content = complex || simple;
    if (content) {
      const extension = xmlChild(content, 'extension'),
        restriction = xmlChild(content, 'restriction');
      const derivation = extension || restriction;
      if (!derivation) throw new Error('example_unavailable');
      const base = derivation.getAttribute('base'),
        baseType = index.types.get(xmlResolveKey(index, derivation, base));
      if (simple) {
        if (restriction) target.textContent = xmlSimpleValue(content, xmlFieldHint(type), index, depth + 1);
        else if (baseType?.localName === 'complexType')
          populateXmlType(output, target, baseType, index, activeTypes, depth + 1);
        else
          target.textContent = baseType
            ? xmlSimpleValue(baseType, xmlFieldHint(type), index, depth + 1)
            : xmlBuiltinValue(index, derivation, base, xmlFieldHint(type));
      } else {
        if (restriction && baseType) inheritXmlAttributes(target, baseType, index, depth + 1);
        else if (baseType) populateXmlType(output, target, baseType, index, activeTypes, depth + 1);
        else if (xmlResolveKey(index, derivation, base) !== xmlKey(XSD, 'anyType'))
          throw new Error('example_unavailable');
        populateXmlParticles(output, target, derivation, index, activeTypes, depth + 1);
      }
      addXmlAttributes(target, derivation, index, depth + 1);
    } else populateXmlParticles(output, target, type, index, activeTypes, depth + 1);
    addXmlAttributes(target, type, index, depth + 1);
  } finally {
    activeTypes.delete(type);
  }
}
function inheritXmlAttributes(target, type, index, depth) {
  xmlBudget(index, depth);
  const content = xmlChild(type, 'complexContent') || xmlChild(type, 'simpleContent');
  const derivation = content && (xmlChild(content, 'extension') || xmlChild(content, 'restriction'));
  if (derivation) {
    const base = index.types.get(xmlResolveKey(index, derivation, derivation.getAttribute('base')));
    if (base) inheritXmlAttributes(target, base, index, depth + 1);
    addXmlAttributes(target, derivation, index, depth + 1);
  }
  addXmlAttributes(target, type, index, depth + 1);
}
function populateXmlParticles(output, target, parent, index, activeTypes, depth) {
  for (const particle of directChildren(parent))
    populateXmlParticle(output, target, particle, index, activeTypes, depth);
}
function populateXmlParticle(output, target, particle, index, activeTypes, depth) {
  if (!['element', 'sequence', 'all', 'choice', 'group', 'any'].includes(particle.localName)) return;
  xmlBudget(index, depth);
  const minimum = particle.hasAttribute('minOccurs') ? Number(particle.getAttribute('minOccurs')) : 1;
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) throw new Error('example_unavailable');
  for (let repeat = 0; repeat < minimum; repeat++) {
    if (particle.localName === 'any') throw new Error('example_unavailable');
    if (particle.localName === 'element') {
      const ref = particle.getAttribute('ref'),
        name = particle.getAttribute('name') || xmlLocalName(ref);
      if (!name) throw new Error('example_unavailable');
      const referenced = ref && index.elements.get(xmlResolveKey(index, particle, ref));
      if (referenced && ['true', '1'].includes(referenced.getAttribute('abstract')))
        throw new Error('example_unavailable');
      const namespace = xmlElementNamespace(index, particle, particle);
      const element = namespace ? output.createElementNS(namespace, name) : output.createElement(name);
      if (!namespace && target.namespaceURI)
        element.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', '');
      target.append(element);
      populateXmlElement(output, element, particle, index, activeTypes, depth + 1);
    } else if (particle.localName === 'group' && particle.hasAttribute('ref')) {
      const group = index.groups.get(xmlResolveKey(index, particle, particle.getAttribute('ref')));
      if (!group) throw new Error('example_unavailable');
      populateXmlParticles(output, target, group, index, activeTypes, depth + 1);
    } else if (particle.localName === 'choice') {
      const branch = directChildren(particle).find((child) =>
        ['element', 'sequence', 'choice', 'group', 'any'].includes(child.localName),
      );
      if (!branch) throw new Error('example_unavailable');
      populateXmlParticle(output, target, branch, index, activeTypes, depth + 1);
    } else populateXmlParticles(output, target, particle, index, activeTypes, depth + 1);
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
function addXmlAttributes(target, type, index, depth) {
  xmlBudget(index, depth);
  for (const attribute of directChildren(type)) {
    const ref = attribute.getAttribute('ref');
    if (attribute.localName === 'attributeGroup' && ref) {
      const group = index.attributeGroups.get(xmlResolveKey(index, attribute, ref));
      if (!group) throw new Error('example_unavailable');
      addXmlAttributes(target, group, index, depth + 1);
    }
    if (
      attribute.localName !== 'attribute' ||
      (!['required', 'prohibited'].includes(attribute.getAttribute('use')) &&
        !attribute.hasAttribute('fixed'))
    )
      continue;
    const definition = ref ? index.attributes.get(xmlResolveKey(index, attribute, ref)) : attribute;
    if (!definition) throw new Error('example_unavailable');
    const name = definition.getAttribute('name');
    const namespace = ref
      ? xmlResolveKey(index, attribute, ref).split('\u0000')[0]
      : definition.getAttribute('form') === 'qualified' ||
          (definition.getAttribute('form') !== 'unqualified' &&
            definition.ownerDocument.documentElement.getAttribute('attributeFormDefault') === 'qualified')
        ? xmlSchemaNamespace(index, definition)
        : '';
    if (attribute.getAttribute('use') === 'prohibited') {
      target.removeAttributeNS(namespace || null, name);
      continue;
    }
    const value =
      definition.getAttribute('fixed') ??
      definition.getAttribute('default') ??
      (xmlChild(definition, 'simpleType')
        ? xmlSimpleValue(xmlChild(definition, 'simpleType'), name, index, depth + 1)
        : index.types.has(xmlResolveKey(index, definition, definition.getAttribute('type')))
          ? xmlSimpleValue(
              index.types.get(xmlResolveKey(index, definition, definition.getAttribute('type'))),
              name,
              index,
              depth + 1,
            )
          : xmlBuiltinValue(index, definition, definition.getAttribute('type'), name));
    if (namespace) target.setAttributeNS(namespace, `a${target.attributes.length}:${name}`, value);
    else target.setAttribute(name, value);
  }
}
function xmlFieldHint(element) {
  const annotation = xmlChild(element, 'annotation');
  return `${element.getAttribute('name') || ''} ${annotation?.textContent || ''}`;
}
function xmlSimpleValue(type, field = '', index, depth = 0) {
  xmlBudget(index, depth);
  const restriction = xmlChild(type, 'restriction');
  if (!restriction) throw new Error('example_unavailable');
  const enumerations = directChildren(restriction).filter((child) => child.localName === 'enumeration');
  if (enumerations.length) {
    // XBau and other XÖV code schemas can name the exact message in an enumeration annotation.
    // Use that explicit association, never a number inferred from an element-name suffix.
    const messageNames = new Set(
      index.roots
        .filter((root) => root.namespace === xmlSchemaNamespace(index, type))
        .map((root) => root.name),
    );
    const associated = enumerations
      .map((item) => ({
        item,
        names: [...(xmlChild(item, 'annotation')?.getElementsByTagName('*') || [])]
          .map((node) => node.textContent.trim())
          .filter((name) => messageNames.has(name)),
      }))
      .filter(({ names }) => names.length);
    const matching = associated.filter(({ names }) => names.includes(index.root.name));
    if (associated.length && matching.length !== 1) throw new Error('example_unavailable');
    return (matching[0]?.item || enumerations[0]).getAttribute('value');
  }
  const base = restriction.getAttribute('base');
  const baseType = index.types.get(xmlResolveKey(index, restriction, base));
  const constraints = { type: 'string' };
  for (const facet of directChildren(restriction)) {
    if (facet.localName === 'pattern') {
      const pattern = facet.getAttribute('value');
      index.patternBytes = (index.patternBytes || 0) + pattern.length;
      if (index.patternBytes > 2 * 1024 * 1024) throw new Error('example_unavailable');
      constraints.pattern = xsdStringPattern(pattern);
    }
    if (facet.localName === 'minLength') constraints.minLength = Number(facet.getAttribute('value'));
    if (facet.localName === 'maxLength') constraints.maxLength = Number(facet.getAttribute('value'));
    if (facet.localName === 'length')
      constraints.minLength = constraints.maxLength = Number(facet.getAttribute('value'));
    // These need typed XSD facet handling. Refuse rather than silently dropping a constraint.
    if (
      [
        'minInclusive',
        'maxInclusive',
        'minExclusive',
        'maxExclusive',
        'totalDigits',
        'fractionDigits',
      ].includes(facet.localName)
    )
      throw new Error('example_unavailable');
  }
  if (Object.keys(constraints).length === 1)
    return baseType
      ? xmlSimpleValue(baseType, field, index, depth + 1)
      : xmlBuiltinValue(index, restriction, base, field);
  // Combining a derived pattern with an unresolved base restriction could produce invalid data.
  if (baseType) throw new Error('example_unavailable');
  if (!index.stringValue) throw new Error('example_unavailable');
  return index.stringValue(constraints, field);
}
function xsdStringPattern(pattern) {
  // XSD patterns match a complete value. Refuse unsupported XSD-only regex features.
  let translated = '',
    escaped = false,
    characterClass = false;
  for (let offset = 0; offset < pattern.length; offset++) {
    const character = pattern[offset];
    if (
      !escaped &&
      character === '\\' &&
      (['i', 'I', 'c', 'C'].includes(pattern[offset + 1]) ||
        ['\\p{Is', '\\P{Is'].some((prefix) => pattern.startsWith(prefix, offset)))
    )
      throw new Error('example_unavailable');
    if (!escaped && characterClass && character === '-' && pattern[offset + 1] === '[')
      throw new Error('example_unavailable');
    if (!escaped && character === '[') characterClass = true;
    if (!escaped && character === ']') characterClass = false;
    translated +=
      !escaped && !characterClass && ['^', '$'].includes(character) ? `\\${character}` : character;
    escaped = character === '\\' && !escaped;
  }
  return `^(?:${translated})$`;
}
function xmlValue(type, field = '') {
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
function addSchemaLocation(root, namespace, schemaLocation) {
  if (!schemaLocation) return;
  schemaLocation = schemaLocation.split('#')[0];
  const xsi = 'http://www.w3.org/2001/XMLSchema-instance';
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', xsi);
  if (namespace) root.setAttributeNS(xsi, 'xsi:schemaLocation', `${namespace} ${schemaLocation}`);
  else root.setAttributeNS(xsi, 'xsi:noNamespaceSchemaLocation', schemaLocation);
}
