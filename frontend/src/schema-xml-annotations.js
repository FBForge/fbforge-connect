import { cleanText, resolveUri, budget, source, mergeHints } from './schema-hints.js';
const XSD = 'http://www.w3.org/2001/XMLSchema',
  XMLNS = 'http://www.w3.org/2000/xmlns/',
  XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const children = (node, name) =>
  [...node.children].filter((child) => child.namespaceURI === XSD && (!name || child.localName === name));
const key = (namespace, local) => JSON.stringify([namespace || '', local]);
export function annotateXmlSchema(root, packet, Parser) {
  if (typeof Parser !== 'function' || !packet.schemas.length || packet.schemas.length > 512)
    throw new Error('unsupported_xsd');
  const tick = budget(),
    files = new Map();
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
  function context(node, file, namespace = file.namespace) {
    const parts = [];
    let current = node;
    while (current?.nodeType === 1) {
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter(
            (item) => item.namespaceURI === current.namespaceURI && item.localName === current.localName,
          )
        : [current];
      parts.unshift(`xs:${current.localName}[${siblings.indexOf(current) + 1}]`);
      current = current.parentElement;
    }
    return { node, file, namespace, uri: file.uri, location: '/' + parts.join('/'), kind: 'XSD' };
  }
  function schemaName(ctx, value) {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length > 2) return null;
    const namespace = ctx.node.lookupNamespaceURI(parts.length === 2 ? parts[0] : null) || '';
    return { namespace: !namespace && !ctx.file.namespace ? ctx.namespace : namespace, local: parts.at(-1) };
  }
  const localName = root.key.split(':').at(-1),
    instanceNamespace = root.namespace || '';
  let candidates = [];
  for (const file of files.values())
    for (const node of children(file.root, 'element'))
      if (file.namespace === instanceNamespace && node.getAttribute('name') === localName)
        candidates.push(context(node, file));
  const selectedUri = resolveUri(packet.schemaUri.split('#')[0], packet.schemaUri);
  if (candidates.some((ctx) => ctx.uri === selectedUri))
    candidates = candidates.filter((ctx) => ctx.uri === selectedUri);
  else {
    const locations = root.children
      .filter(
        (child) =>
          child.type === 'attribute' &&
          child.namespace === XSI &&
          /(?:^|:)(?:noNamespaceSchemaLocation|schemaLocation)$/.test(child.key),
      )
      .flatMap((child) => child.value.trim().split(/\s+/));
    const hinted = candidates.filter((ctx) =>
      locations.some(
        (location) => ctx.uri === resolveUri(location, packet.schemaUri) || ctx.uri.endsWith('/' + location),
      ),
    );
    if (hinted.length) candidates = hinted;
    else if (candidates.some((ctx) => ctx.file.primary))
      candidates = candidates.filter((ctx) => ctx.file.primary);
  }
  if (candidates.length !== 1)
    return {
      root,
      status: 'partial',
      matchedCount: 0,
      labelCount: 0,
      ambiguousCount: candidates.length ? 1 : 0,
    };
  const symbols = new Map(),
    visited = new Set();
  let missing = false,
    unsupported = false;
  function index(file, namespace = file.namespace, depth = 0) {
    tick();
    if (depth > 64) throw new Error('schema_view_limit');
    const id = key(file.uri, namespace);
    if (visited.has(id)) return;
    visited.add(id);
    for (const node of children(file.root)) {
      if (['redefine', 'override'].includes(node.localName)) unsupported = true;
      if (
        ['element', 'attribute', 'complexType', 'simpleType', 'group', 'attributeGroup'].includes(
          node.localName,
        ) &&
        node.getAttribute('name')
      ) {
        const name = key(namespace, node.getAttribute('name')),
          category = node.localName;
        if (!symbols.has(category)) symbols.set(category, new Map());
        const table = symbols.get(category),
          rows = table.get(name) || [];
        if (!rows.some((ctx) => ctx.node === node && ctx.namespace === namespace))
          table.set(name, [...rows, context(node, file, namespace)]);
      }
      if (['include', 'import'].includes(node.localName)) {
        const location = node.getAttribute('schemaLocation'),
          imported = node.getAttribute('namespace') || '';
        const targets = location
          ? [files.get(resolveUri(location, file.uri))].filter(Boolean)
          : node.localName === 'import'
            ? [...files.values()].filter((other) => other.namespace === imported)
            : [];
        if (!targets.length) missing = true;
        for (const target of targets) {
          if (
            (node.localName === 'include' && target.namespace && target.namespace !== namespace) ||
            (node.localName === 'import' && target.namespace !== imported)
          ) {
            missing = true;
            continue;
          }
          index(target, node.localName === 'include' ? namespace : target.namespace, depth + 1);
        }
      }
    }
  }
  index(candidates[0].file);
  if (unsupported) return { root, status: 'partial', matchedCount: 0, labelCount: 0, ambiguousCount: 1 };
  function lookup(category, qname) {
    tick();
    if (!qname) return null;
    const rows = symbols.get(category)?.get(key(qname.namespace, qname.local));
    return rows?.length === 1 ? rows[0] : null;
  }
  function doc(ctx, rank, type = null, typeOnly = false) {
    const docs = children(ctx.node, 'annotation').flatMap((annotation) =>
      children(annotation, 'documentation'),
    );
    const language = (node) => node.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') || '';
    const selected =
      docs.find((node) => /^de(?:-|$)/i.test(language(node))) ||
      docs.find((node) => !language(node)) ||
      docs[0];
    const description = selected && cleanText(selected.textContent, 4000);
    const firstLine = description
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    // XSD documentation is often a whole paragraph, not a field title. Keep that as help text.
    // FIM XSD exports explicitly prefix the authored label and append version/type metadata.
    // Keep that full documentation as help; never infer a label from a technical FIM identifier.
    const fimLabel = firstLine?.match(
      /^(?:Datenschema|Datenfeldgruppe|Datenfeld):\s+(.+?)(?=\s+-\s+Version:\s+\d|$)/,
    )?.[1];
    const heading = fimLabel || firstLine;
    const title = !typeOnly && heading && heading.length <= 120 && !/[.!?]$/.test(heading) ? heading : null;
    return {
      rank,
      title,
      description: description !== title ? description : null,
      type,
      format: null,
      valueLabel: null,
      source: source(ctx),
    };
  }
  function reference(ctx, category) {
    return ctx.node.getAttribute('ref')
      ? lookup(category, schemaName(ctx, ctx.node.getAttribute('ref')))
      : ctx;
  }
  function type(ctx) {
    const name = schemaName(ctx, ctx.node.getAttribute('type'));
    if (name)
      return name.namespace === XSD
        ? { builtin: name.local, qname: name }
        : { context: lookup('complexType', name) || lookup('simpleType', name), qname: name };
    const nested = children(ctx.node).filter((node) =>
      ['complexType', 'simpleType'].includes(node.localName),
    );
    return nested.length === 1
      ? { context: context(nested[0], ctx.file, ctx.namespace) }
      : { builtin: 'anyType', qname: { namespace: XSD, local: 'anyType' } };
  }
  function derives(current, declared, seen = new Set()) {
    tick();
    if (!current || !declared) return false;
    if (
      (current.namespace === declared.namespace && current.local === declared.local) ||
      (declared.namespace === XSD && declared.local === 'anyType')
    )
      return true;
    const id = key(current.namespace, current.local);
    if (seen.has(id)) return false;
    seen = new Set(seen).add(id);
    const ctx = lookup('complexType', current) || lookup('simpleType', current);
    if (!ctx) return false;
    const wrappers = children(ctx.node).filter((node) =>
      ['complexContent', 'simpleContent'].includes(node.localName),
    );
    const extension = (
      wrappers.length ? wrappers.flatMap((node) => children(node)) : children(ctx.node)
    ).find((node) => ['extension', 'restriction'].includes(node.localName));
    return extension
      ? derives(
          schemaName(context(extension, ctx.file, ctx.namespace), extension.getAttribute('base')),
          declared,
          seen,
        )
      : false;
  }
  const membersCache = new Map();
  function members(ctx, seen = new Set()) {
    tick();
    if (!ctx || seen.has(ctx.node)) return { elements: [], attributes: [], unknown: true };
    const cacheKey = key(ctx.uri + ctx.location, ctx.namespace);
    if (membersCache.has(cacheKey)) return membersCache.get(cacheKey);
    seen = new Set(seen).add(ctx.node);
    const result = { elements: [], attributes: [], unknown: false };
    function collect(container, origin, depth, required = true) {
      tick();
      if (depth > 64) throw new Error('schema_view_limit');
      if (container.getAttribute('minOccurs') === '0') required = false;
      if (
        container.localName === 'choice' &&
        required !== false &&
        children(container).filter((node) =>
          ['element', 'group', 'sequence', 'choice', 'any'].includes(node.localName),
        ).length > 1
      )
        required = null;
      for (const node of children(container)) {
        const child = context(node, origin.file, origin.namespace);
        if (node.localName === 'element')
          result.elements.push({
            ...child,
            required: node.getAttribute('minOccurs') === '0' ? false : required,
          });
        else if (node.localName === 'attribute') {
          const name = node.getAttribute('name') || node.getAttribute('ref');
          if (node.getAttribute('use') === 'prohibited')
            result.attributes = result.attributes.filter(
              (item) => (item.node.getAttribute('name') || item.node.getAttribute('ref')) !== name,
            );
          else result.attributes.push(child);
        } else if (['sequence', 'choice', 'all', 'complexContent', 'simpleContent'].includes(node.localName))
          collect(node, child, depth + 1, required);
        else if (['extension', 'restriction'].includes(node.localName)) {
          if (node.localName === 'extension') {
            const qname = schemaName(child, node.getAttribute('base'));
            if (qname?.namespace !== XSD) {
              const base = lookup('complexType', qname),
                inherited = base && members(base, seen);
              if (inherited) {
                result.elements.push(
                  ...inherited.elements.map((item) => ({
                    ...item,
                    required:
                      required === false || item.required === false
                        ? false
                        : required === null || item.required === null
                          ? null
                          : true,
                  })),
                );
                result.attributes.push(...inherited.attributes);
                result.unknown ||= inherited.unknown;
              } else if (!lookup('simpleType', qname)) result.unknown = true;
            }
          }
          collect(node, child, depth + 1, required);
        } else if (['group', 'attributeGroup'].includes(node.localName)) {
          const target = node.getAttribute('ref')
            ? lookup(node.localName, schemaName(child, node.getAttribute('ref')))
            : child;
          if (!target || seen.has(target.node)) result.unknown = true;
          else {
            const nested = members(target, seen);
            result.elements.push(
              ...nested.elements.map((item) => ({
                ...item,
                required:
                  required === false || item.required === false
                    ? false
                    : required === null || item.required === null
                      ? null
                      : true,
              })),
            );
            result.attributes.push(...nested.attributes);
            result.unknown ||= nested.unknown;
          }
        } else if (['any', 'anyAttribute'].includes(node.localName)) result.unknown = true;
      }
    }
    collect(ctx.node, ctx, 0);
    membersCache.set(cacheKey, result);
    return result;
  }
  function declarationName(ctx, category) {
    const target = reference(ctx, category);
    if (!target) return null;
    const global = target.node.parentElement === target.file.root;
    const qualified =
      global ||
      (target.node.getAttribute('form') ||
        target.file.root.getAttribute(
          category === 'element' ? 'elementFormDefault' : 'attributeFormDefault',
        )) === 'qualified';
    return { namespace: qualified ? target.namespace : '', local: target.node.getAttribute('name') };
  }
  function substitution(actual, head, seen = new Set()) {
    tick();
    if (!actual || seen.has(actual.node)) return false;
    const value = schemaName(actual, actual.node.getAttribute('substitutionGroup'));
    if (!value) return false;
    if (value.namespace === head.namespace && value.local === head.local) return true;
    return substitution(lookup('element', value), head, new Set(seen).add(actual.node));
  }
  function childMatches(offered, data, category) {
    const actual = { namespace: data.namespace || '', local: data.key.replace(/^@/, '').split(':').at(-1) };
    const matches = [];
    for (const ctx of offered) {
      const name = declarationName(ctx, category);
      if (!name) continue;
      if (name.namespace === actual.namespace && name.local === actual.local) matches.push(ctx);
      else if (category === 'element') {
        const alternative = lookup('element', actual);
        if (alternative && substitution(alternative, name))
          matches.push({ ...alternative, required: ctx.required });
      }
    }
    return matches;
  }
  function enumLabels(ctx, value, seen = new Set()) {
    tick();
    if (!ctx || seen.has(ctx.node)) return [];
    seen = new Set(seen).add(ctx.node);
    const result = [];
    const restrictions = children(ctx.node, 'restriction').concat(
      children(ctx.node)
        .filter((node) => ['simpleContent'].includes(node.localName))
        .flatMap((node) => children(node, 'restriction')),
    );
    for (const restriction of restrictions) {
      const origin = context(restriction, ctx.file, ctx.namespace),
        baseName = schemaName(origin, restriction.getAttribute('base'));
      if (baseName?.namespace !== XSD)
        result.push(...enumLabels(lookup('simpleType', baseName), value, seen));
      for (const entry of children(restriction, 'enumeration'))
        if (entry.getAttribute('value') === value) {
          const hint = doc(context(entry, ctx.file, ctx.namespace), 0);
          if (hint.title) result.push(hint.title);
        }
    }
    return [...new Set(result)];
  }
  let matchedCount = 0,
    labelCount = 0,
    ambiguousCount = 0,
    unmatched = 0;
  function visit(data, offered, inheritedBindings = new Map(), textHint = null) {
    tick();
    const bindings = new Map(inheritedBindings);
    for (const child of data.children)
      if (child.namespace === XMLNS)
        bindings.set(child.key === '@xmlns' ? '' : child.key.split(':').at(-1), child.value);
    const alternatives = [],
      contentModels = [];
    for (const entry of offered) {
      const category = data.type === 'attribute' ? 'attribute' : 'element',
        target = reference(entry, category);
      if (!target) continue;
      const rows = [doc(entry, 0)];
      if (target.node !== entry.node) rows.push(doc(target, 1));
      let declared = type(target),
        validType = true;
      const override = data.children.find((child) => child.namespace === XSI && child.key.endsWith(':type'));
      if (override) {
        const parts = override.value.trim().split(':');
        const actual = {
          namespace: bindings.get(parts.length === 2 ? parts[0] : '') || '',
          local: parts.at(-1),
        };
        if (parts.length > 2 || !derives(actual, declared.qname)) validType = false;
        else
          declared =
            actual.namespace === XSD
              ? { builtin: actual.local, qname: actual }
              : { context: lookup('complexType', actual) || lookup('simpleType', actual), qname: actual };
      }
      if (declared.builtin)
        rows.push({ ...doc(target, 2, `xs:${declared.builtin}`, true), title: null, description: null });
      else if (declared.context && validType)
        rows.push(
          doc(
            declared.context,
            2,
            declared.qname ? `{${declared.qname.namespace}}${declared.qname.local}` : 'Anonymer XSD-Typ',
            true,
          ),
        );
      const labels = declared.context && validType ? enumLabels(declared.context, data.value) : [];
      if (labels.length === 1) rows[0] = { ...rows[0], valueLabel: labels[0] };
      alternatives.push(rows);
      contentModels.push(
        validType && declared.context
          ? members(declared.context)
          : { elements: [], attributes: [], unknown: !declared.builtin || !validType },
      );
    }
    const requireds = offered.map((ctx) =>
      data.type === 'attribute'
        ? ctx.node.getAttribute('use') === 'required'
        : Object.hasOwn(ctx, 'required')
          ? ctx.required
          : (ctx.node.getAttribute('minOccurs') || '1') !== '0',
    );
    const required =
      requireds.length && requireds.every((value) => value === true)
        ? true
        : requireds.length && requireds.every((value) => value === false)
          ? false
          : null;
    let hint = mergeHints(alternatives, required);
    if (textHint && ['text', 'cdata', 'whitespace'].includes(data.type))
      hint = { ...textHint, title: null, required: null, description: null };
    if (hint) {
      matchedCount++;
      if (hint.title) labelCount++;
      if (hint.ambiguous) ambiguousCount++;
    } else unmatched++;
    const resultChildren = data.children.map((child) => {
      if (child.namespace === XMLNS || child.namespace === XSI) return visit(child, [], bindings);
      const category = child.type === 'attribute' ? 'attribute' : 'element';
      const choices = contentModels.map((model) =>
        childMatches(category === 'attribute' ? model.attributes : model.elements, child, category),
      );
      // Missing branches and competing declarations stay ambiguous instead of choosing an arbitrary type.
      const offeredChildren = choices.length && choices.every((rows) => rows.length) ? choices.flat() : [];
      return visit(
        child,
        offeredChildren,
        bindings,
        ['text', 'cdata', 'whitespace'].includes(child.type) ? hint : null,
      );
    });
    return { ...data, label: hint?.title || data.label, schema: hint, children: resultChildren };
  }
  const annotated = visit(root, candidates);
  return {
    root: annotated,
    status: missing || unmatched || ambiguousCount ? 'partial' : 'ready',
    matchedCount,
    labelCount,
    ambiguousCount,
  };
}
