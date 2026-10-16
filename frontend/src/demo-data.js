import applicationText from '../../engine/contract/src/main/resources/org/fitconnect/integration/contract/demo/application.schema.json?raw';
import replyText from '../../engine/contract/src/main/resources/org/fitconnect/integration/contract/demo/reply.schema.json?raw';
export const demoSchemas = Object.freeze({
  application: Object.freeze({
    schemaUri: 'urn:fit-connect:test-client:demo:application:1',
    mimeType: 'application/json',
    document: applicationText,
  }),
  reply: Object.freeze({
    schemaUri: 'urn:fit-connect:test-client:demo:reply:1',
    mimeType: 'application/json',
    document: replyText,
  }),
});
export { isDemoSchema } from './demo-identifiers.js';
export function downloadDemoSchema(kind) {
  const row = demoSchemas[kind];
  if (!row) return;
  const url = URL.createObjectURL(new Blob([row.document], { type: 'application/schema+json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `test-client-demo-${kind}-v1.schema.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
