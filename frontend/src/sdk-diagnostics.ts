import { diagnosticCode } from './diagnostics.js';

export interface SdkDiagnostic {
  stage: string;
  type: string;
  message: string;
}
export const sdkStageLabels: Readonly<Record<string, string>> = Object.freeze({
  RECEIVE: 'Einreichung prüfen',
  REPLY: 'Antwort prüfen',
  EVENT_LOG: 'Event Log prüfen',
  METADATA: 'Metadaten prüfen',
  DATA: 'Fachdaten prüfen',
  ATTACHMENTS: 'Anlagen prüfen',
  REPLY_CHANNEL: 'Antwortkanal prüfen',
});

/** Only the native structured failure contract enables SDK text. Raw exceptions stay private. */
export function sdkDiagnostics(cause: unknown): SdkDiagnostic[] {
  if (!cause || typeof cause !== 'object' || diagnosticCode(cause) === 'unknown_error') return [];
  if (!Object.hasOwn(cause, 'diagnostics')) return [];
  const values = (cause as { diagnostics: unknown }).diagnostics;
  if (!Array.isArray(values) || values.length > 8) return [];
  const result: SdkDiagnostic[] = [];
  for (const value of values) {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 3 ||
      !['stage', 'type', 'message'].every((key) => Object.hasOwn(value, key))
    )
      return [];
    const { stage, type, message } = value;
    if (
      typeof stage !== 'string' ||
      !Object.hasOwn(sdkStageLabels, stage) ||
      typeof type !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_$]{0,127}$/.test(type) ||
      typeof message !== 'string' ||
      !message.trim() ||
      [...message].length > 1024 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(message)
    )
      return [];
    result.push(Object.freeze({ stage, type, message }));
  }
  return result;
}
