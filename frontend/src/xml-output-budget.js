// Conservative UTF-8/XML-escape accounting before DOM allocation and serialization.
export function boundedXmlOutput() {
  let remaining = 2 * 1024 * 1024;
  function charge(parts, markup) {
    const cost = parts.reduce((total, value) => total + String(value ?? '').length * 6, markup);
    if (cost > remaining) throw new Error('example_unavailable');
    remaining -= cost;
  }
  return {
    document(namespace, name) {
      charge([namespace, name, name], 64);
      return window.document.implementation.createDocument(namespace || null, name, null);
    },
    element(document, namespace, name) {
      charge([namespace, name, name], 32);
      return namespace ? document.createElementNS(namespace, name) : document.createElement(name);
    },
    text(target, value) {
      charge([value], 0);
      target.textContent = value;
    },
    attribute(target, namespace, name, value) {
      charge([namespace, name, value], 32);
      if (namespace) target.setAttributeNS(namespace, name, value);
      else target.setAttribute(name, value);
    },
  };
}
