import { xmlExample, xmlMessages } from './xml-examples.js';
import { assertSchemaAvailable } from './schema-availability.js';

function exampleSource(source) {
  let bundle, parsed;
  try {
    parsed = JSON.parse(source);
    if (parsed?.schemaPackage === 1) bundle = parsed;
  } catch {
    /* A raw XML schema is handled below. */
  }
  if (parsed !== undefined && !bundle) assertSchemaAvailable(parsed);
  return bundle;
}

export function exampleMessages(source, mimeType, uri) {
  const bundle = exampleSource(source);
  return mimeType === 'application/xml'
    ? xmlMessages(bundle?.schemas || [{ name: 'schema.xsd', text: source }], uri)
    : { roots: [], selected: null };
}

export async function generateExample(source, mimeType, uri, requestedRoot) {
  const bundle = exampleSource(source);
  if (mimeType === 'application/xml') {
    try {
      const schemas = bundle?.schemas || [{ name: 'schema.xsd', text: source }],
        properties = Object.create(null);
      let count = 0;
      // Collect only string constraints, then evaluate them off the renderer thread.
      xmlExample(schemas, uri, requestedRoot, (constraints, field) => {
        properties[`field${count++}`] = { ...constraints, title: field };
        return '';
      });
      const values = count ? JSON.parse(await jsonDraft(JSON.stringify({ type: 'object', properties }))) : {};
      let index = 0;
      return xmlExample(schemas, uri, requestedRoot, () => {
        const value = values[`field${index++}`];
        if (typeof value !== 'string') throw new Error();
        return value;
      }).data;
    } catch (cause) {
      throw new Error(
        ['schema_unavailable', 'xml_message_required'].includes(cause?.message)
          ? cause.message
          : 'example_unavailable',
      );
    }
  }
  return jsonDraft(source);
}

function jsonDraft(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./schema-example-worker.js', import.meta.url), { type: 'module' });
    const done = (error, value) => {
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => done(new Error('example_unavailable')), 2500);
    worker.onmessage = ({ data }) =>
      typeof data?.output === 'string' && data.output.length <= 2 * 1024 * 1024
        ? done(null, data.output)
        : done(
            new Error(data?.error === 'schema_unavailable' ? 'schema_unavailable' : 'example_unavailable'),
          );
    worker.onerror = () => done(new Error('example_unavailable'));
    try {
      worker.postMessage(source);
    } catch {
      done(new Error('example_unavailable'));
    }
  });
}
