export const DEMO_APPLICATION_SCHEMA = 'urn:fit-connect:test-client:demo:application:1';
export const DEMO_REPLY_SCHEMA = 'urn:fit-connect:test-client:demo:reply:1';
export const isDemoSchema = (uri) => uri === DEMO_APPLICATION_SCHEMA || uri === DEMO_REPLY_SCHEMA;
