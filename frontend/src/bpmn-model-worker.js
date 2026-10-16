import { parseBpmnModel } from './bpmn-model.js';
self.onmessage = async (event) => {
  try {
    self.postMessage({ ok: true, model: await parseBpmnModel(event.data) });
  } catch (cause) {
    self.postMessage({
      ok: false,
      error: ['bpmn_limit', 'bpmn_invalid'].includes(cause?.message) ? cause.message : 'bpmn_invalid',
    });
  }
};
