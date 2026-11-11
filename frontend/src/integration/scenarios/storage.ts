import { testPackError } from '../../test-packs.js';
import { invalid, uuid, validateScenario } from './model.ts';
import { validateRun } from './runs.ts';
import type { NativeInvoke } from '../../contracts.d.ts';
import { validateSeries } from './series.ts';
import type { Series } from './series.ts';
import type { Run, Scenario } from './types.ts';

export interface ScenarioSummary {
  id: string;
  name: string;
  mode: string;
  caseCount: number;
}
export interface RunSummary {
  outcome?: string;
  fingerprint?: string;
  id: string;
  name: string;
  scenarioId: string;
  environment: string;
  apiVersion: string;
  variantId: string;
  startedAt: string;
  cursor: number;
  total: number;
  reference: boolean;
}
const call = (invoke: NativeInvoke, action: string, rest: object = {}) =>
  invoke('test_library', { request: { action, ...rest } });
export async function listScenarios(invoke: NativeInvoke): Promise<ScenarioSummary[]> {
  const rows = await call(invoke, 'scenario_list');
  if (
    !Array.isArray(rows) ||
    rows.length > 32 ||
    rows.some(
      (r) =>
        !r ||
        !uuid(r.id) ||
        typeof r.name !== 'string' ||
        !['sender', 'receiver', 'both'].includes(r.mode) ||
        !Number.isInteger(r.caseCount) ||
        r.caseCount < 1 ||
        r.caseCount > 20,
    ) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    invalid();
  return rows;
}
export async function readScenario(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  const s = validateScenario(await call(invoke, 'scenario_read', { id }));
  if (s.id !== id) invalid();
  return s;
}
export async function saveScenario(invoke: NativeInvoke, document: Scenario) {
  return call(invoke, 'scenario_save', { document: validateScenario(document) });
}
export async function removeScenario(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  await call(invoke, 'scenario_delete', { id });
}
export async function listRuns(invoke: NativeInvoke): Promise<RunSummary[]> {
  const rows = await call(invoke, 'scenario_run_list');
  if (
    !Array.isArray(rows) ||
    rows.length > 32 ||
    rows.some(
      (r) =>
        !r ||
        !uuid(r.id) ||
        !uuid(r.scenarioId) ||
        typeof r.name !== 'string' ||
        !['TEST', 'STAGE', 'PROD'].includes(r.environment) ||
        !['v2', 'v3'].includes(r.apiVersion) ||
        !uuid(r.variantId) ||
        !Number.isFinite(Date.parse(r.startedAt)) ||
        !Number.isInteger(r.cursor) ||
        !Number.isInteger(r.total) ||
        r.cursor < 0 ||
        r.cursor > r.total ||
        r.total < 1 ||
        r.total > 152 ||
        (r.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(r.fingerprint)) ||
        (r.outcome !== undefined &&
          (!['passed', 'failed', 'blocked', 'manual', 'cancelled', 'pending'].includes(r.outcome) ||
            (['passed', 'manual'].includes(r.outcome) && r.cursor !== r.total))) ||
        typeof r.reference !== 'boolean',
    ) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    invalid();
  return rows;
}
export async function readRun(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  const r = validateRun(await call(invoke, 'scenario_run_read', { id }));
  if (r.id !== id) invalid();
  return r;
}
export async function saveRun(invoke: NativeInvoke, document: Run) {
  return call(invoke, 'scenario_run_save', { document: validateRun(document) });
}
export async function removeRun(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  await call(invoke, 'scenario_run_delete', { id });
}
export function scenarioError(cause: unknown) {
  const code = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '';
  if (
    code.startsWith('test_pack_') ||
    ['test_data_invalid', 'test_schema_invalid', 'test_reply_mismatch', 'schema_id_mismatch'].includes(
      code,
    ) ||
    ['invalid_data', 'invalid_schema', 'invalid_reply_offer'].includes(code)
  )
    return testPackError(cause);
  if (code === 'scenario_authoring_limit')
    return 'Die Grenze für Testfälle, variable Angaben oder Testdaten ist erreicht. Entfernen Sie nicht benötigte Daten.';
  if (code === 'scenario_size_limit')
    return 'Die Testdaten und Anlagen sind für einen geschützten Durchlauf zu umfangreich. Entfernen Sie nicht benötigte Anlagen oder teilen Sie den Test auf.';
  if (code === 'vault_limit')
    return 'Die geschützte Sammlung ist voll. Exportieren und löschen Sie nicht mehr benötigte Tests oder Durchläufe. Referenzen bleiben geschützt.';
  if (code === 'scenario_reference_protected')
    return 'Dieser Durchlauf ist als Referenz geschützt. Heben Sie die Referenz zuerst auf.';
  if (code === 'vault_unsupported')
    return 'Geschütztes Speichern ist auf diesem Betriebssystem noch nicht verfügbar. Exportieren Sie Ihre Testdefinition vor dem Beenden.';
  if (code === 'scenario_context_changed')
    return 'Profil, API oder Umgebung passen nicht zu diesem Testschritt. Wechseln Sie zur zugeordneten Seite.';
  if (code === 'scenario_invalid')
    return 'Der Test ist unvollständig oder ungültig. Prüfen Sie Felder, Werte, Erwartungen und das Dateiformat.';
  return 'Die Testaktion konnte nicht abgeschlossen werden. Ihre geöffneten Daten bleiben erhalten. Prüfen Sie Verbindung, Dateiformat und geschützten Speicher.';
}

export async function listSeries(
  invoke: NativeInvoke,
): Promise<{ id: string; name: string; total: number; environment: string }[]> {
  const rows = await call(invoke, 'scenario_series_list');
  if (
    !Array.isArray(rows) ||
    rows.length > 32 ||
    rows.some(
      (r) =>
        !r ||
        !uuid(r.id) ||
        typeof r.name !== 'string' ||
        !Number.isInteger(r.total) ||
        r.total < 1 ||
        r.total > 32 ||
        !['TEST', 'STAGE', 'PROD'].includes(r.environment),
    ) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    invalid();
  return rows;
}
export async function readSeries(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  const s = validateSeries(await call(invoke, 'scenario_series_read', { id }));
  if (s.id !== id) invalid();
  return s;
}
export const saveSeries = (invoke: NativeInvoke, document: Series) =>
  call(invoke, 'scenario_series_save', { document: validateSeries(document) });
export async function removeSeries(invoke: NativeInvoke, id: string) {
  if (!uuid(id)) invalid();
  return call(invoke, 'scenario_series_delete', { id });
}
