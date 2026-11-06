export type Mode = 'sender' | 'receiver' | 'both';
export type Scope = 'request' | 'reply';
export type CheckStatus = 'passed' | 'failed' | 'blocked' | 'manual' | 'cancelled';
export interface Variable {
  id: string;
  label: string;
  caseId: string;
  scope: Scope;
  path: string;
  kind: 'text' | 'number' | 'boolean' | 'date' | 'uuid' | 'reference';
  value: string;
}
export interface Rule {
  id: string;
  caseId: string;
  scope: Scope;
  path: string;
  operator: 'equals' | 'present' | 'date' | 'reference';
  value: string;
}
export interface Message {
  schemaUri: string;
  mimeType: string;
  data: string;
  attachments: { fileName: string; mimeType: string; description: string | null; base64: string }[];
  processMessage: { processModelId: string; messageId: string } | null;
  serviceIdentifier?: string;
  serviceName?: string;
  region?: string | null;
  replyOffer?: { schemaUri: string; mimeType: string; processMessages: object[] } | null;
}
export interface TestCase {
  id: string;
  name: string;
  request: Message;
  reply: Message | null;
  receipt: 'accept' | 'reject' | 'none';
  schemas: { uri: string; mimeType: string; content: string }[];
}
export interface Pack {
  format: string;
  version: number;
  name: string;
  cases: TestCase[];
}
export interface Scenario {
  format: 'fbforge-connect-scenario';
  version: 2;
  id: string;
  name: string;
  mode: Mode;
  sharedCase: boolean;
  pack: Pack;
  variables: Variable[];
  variants: { id: string; name: string; values: { variableId: string; value: string }[] }[];
  rules: Rule[];
  comparison: 'exact' | 'xml-structure' | 'rules';
  expectedProblem: string;
}
export interface Assignment {
  apiVersion: 'v2' | 'v3';
  senderProfileId: string;
  receiverProfileId: string;
  sourceDestination: string;
  receiverDestination: string;
}
export interface Step {
  id: string;
  caseId: string;
  type: 'send' | 'receive' | 'compare' | 'receipt' | 'reply' | 'check_reply';
  side: 'sender' | 'receiver';
  external: boolean;
  title: string;
}
export interface Attempt {
  stepId: string;
  status: CheckStatus;
  at: string;
  detail: string;
  recordId: string | null;
}
export interface Run {
  format: 'fbforge-connect-scenario-run';
  version: 2;
  id: string;
  definition: Scenario;
  fingerprint: string;
  variantId: string;
  environment: 'TEST' | 'STAGE' | 'PROD';
  assignment: Assignment;
  startedAt: string;
  pack: Pack;
  cursor: number;
  attempts: Attempt[];
  bindings: { caseId: string; submissionId: string | null; replyId: string | null; testCaseId: string }[];
  reference: boolean;
  references: { testCaseId: string; path: string; raw: string }[];
}
export interface CaseRecord {
  recordId: string;
  caseId: string | null;
  submissionId: string | null;
  replyId: string | null;
  destinationId: string | null;
  kind: string;
  direction: string;
  status: string;
  createdAt: string;
  title: string;
  available?: boolean;
  warnings: string[];
}
