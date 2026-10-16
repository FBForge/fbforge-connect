import { xmlExample } from './schema-examples.js';

export async function generateExample(source, mimeType, uri) {
  let bundle;
  try { const value = JSON.parse(source); if (value?.schemaPackage === 1) bundle = value; } catch {}
  if (mimeType === 'application/xml') {
    try {
      const schemas = bundle?.schemas || [{ name: 'schema.xsd', text: source }], properties = Object.create(null);
      let count = 0;
      // Collect only string constraints, then evaluate them off the renderer thread.
      xmlExample(schemas, uri, undefined, (constraints, field) => {
        properties[`field${count++}`] = { ...constraints, title: field }; return '';
      });
      const values = count ? JSON.parse(await jsonDraft(JSON.stringify({ type: 'object', properties }))) : {};
      let index = 0;
      return xmlExample(schemas, uri, undefined, () => {
        const value = values[`field${index++}`];
        if (typeof value !== 'string') throw new Error();
        return value;
      }).data;
    } catch { throw new Error('example_unavailable'); }
  }
  return jsonDraft(source);
}

function jsonDraft(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./schema-example-worker.js', import.meta.url), { type: 'module' });
    const done = (error, value) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => done(new Error('example_unavailable')), 2500);
    worker.onmessage = ({ data }) => typeof data?.output === 'string' && data.output.length <= 2 * 1024 * 1024
      ? done(null, data.output) : done(new Error('example_unavailable'));
    worker.onerror = () => done(new Error('example_unavailable'));
    try { worker.postMessage(source); } catch { done(new Error('example_unavailable')); }
  });
}
