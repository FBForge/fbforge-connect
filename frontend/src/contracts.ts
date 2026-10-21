/** Public renderer types. Native and file input still require runtime validation. */
export type ApiVersion = 'v2' | 'v3';
export type SessionRole = 'online-service' | 'administrative-system';
export interface Session {
  readonly sessionId: string;
  readonly apiVersion: ApiVersion;
  readonly role: SessionRole;
  readonly environment: 'TEST';
  readonly connected: boolean;
  readonly clientId?: string;
}
export type SavedProfile = {
  readonly profileId: string;
  readonly name: string;
  readonly keyCount: number;
} & (
  | {
      readonly available: true;
      readonly clientId: string;
      readonly apiVersion: ApiVersion;
      readonly role: SessionRole;
    }
  | { readonly available: false; readonly clientId: null; readonly apiVersion: null; readonly role: null }
);
export interface ActivityEvent {
  api?: ApiVersion;
  role: 'Onlinedienst' | 'Fachverfahren';
  action: string;
  status: string;
  started: number;
}
export type SendStatus = 'idle' | 'prepared' | 'running' | 'sent' | 'failed' | 'uncertain' | 'cancelled';
export interface SendOutcome {
  readonly status: SendStatus;
  readonly error?: string | null;
}
