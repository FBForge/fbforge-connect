export type Environment = 'TEST' | 'STAGE' | 'PROD';
/** Public renderer types. Native and file input still require runtime validation. */
export type ApiVersion = 'v2' | 'v3';
export type SessionRole = 'online-service' | 'administrative-system';
export interface Session {
  readonly sessionId: string;
  readonly apiVersion: ApiVersion;
  readonly role: SessionRole;
  readonly environment: Environment;
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
      readonly environment: Environment;
      readonly clientId: string;
      readonly apiVersion: ApiVersion;
      readonly role: SessionRole;
    }
  | {
      readonly available: false;
      readonly environment: null;
      readonly clientId: null;
      readonly apiVersion: null;
      readonly role: null;
    }
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
export type NativeArguments = Record<string, unknown> | Uint8Array;
export type NativeInvoke = (command: string, args?: NativeArguments) => Promise<unknown>;
export type PayloadMime = 'application/json' | 'application/xml';
export interface ProcessMessage {
  readonly processModelId: string;
  readonly messageId: string;
}
export interface SchemaChoice {
  readonly schemaUri: string;
  readonly mimeType: PayloadMime;
}
export interface ServiceOffer {
  readonly identifier: string;
  readonly name: string;
  readonly regions: readonly string[];
  readonly schemas: readonly SchemaChoice[];
  readonly replySchemas: readonly SchemaChoice[];
}
export interface ProcessOffer extends ProcessMessage {
  readonly schemas: readonly SchemaChoice[];
}
export interface RecipientOptions {
  readonly services: readonly ServiceOffer[];
  readonly processes: readonly ProcessOffer[];
}
export interface SchemaSelection {
  readonly schemaUri: string;
  readonly serviceIdentifier?: string;
  readonly processModelId?: string;
  readonly messageId?: string;
  readonly allowExternalSchemas?: boolean;
}
export interface ProfileStorageStatus {
  readonly profileId: string | null;
  readonly saved: boolean;
  readonly error: 'vault_unavailable' | null;
}
export interface ProfileDefaults {
  readonly sourceDestination: string | null;
  readonly receiverDestination: string | null;
}
export interface FlowAssignment {
  readonly senderProfileId: string;
  readonly receiverProfileId: string;
  readonly apiVersion: ApiVersion;
  readonly sourceDestination: string;
  readonly receiverDestination: string;
}
export type FlowStep = 'send' | 'receive' | 'compare' | 'receipt' | 'reply' | 'check_reply';
export interface FlowContext extends FlowAssignment {
  readonly side: 'sender' | 'receiver';
  readonly step?: FlowStep;
}
