/** A malformed local model cannot keep the renderer's event loop busy. */
export function loadBpmnModel(xml) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bpmn-model-worker.js', import.meta.url), { type: 'module' });
    const finish = (error, model) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(model);
    };
    const timer = setTimeout(() => finish('bpmn_limit'), 5000);
    worker.onmessage = (event) =>
      event.data?.ok ? finish(null, event.data.model) : finish(event.data?.error || 'bpmn_invalid');
    worker.onerror = () => finish('bpmn_invalid');
    worker.postMessage(xml);
  });
}
