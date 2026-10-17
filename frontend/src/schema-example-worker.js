import { jsonExample } from './schema-examples.js';

self.onmessage = (event) => {
  try {
    if (typeof event.data !== 'string' || event.data.length > 24 * 1024 * 1024) throw new Error();
    const output = jsonExample(JSON.parse(event.data));
    if (output.length > 2 * 1024 * 1024) throw new Error();
    self.postMessage({ output });
  } catch {
    self.postMessage({ error: true });
  }
};
