import { contentDifferences } from './content-differences.ts';
import { compareTestContent } from '../test-flows.js';
import { messageFields, structuralXml } from './fields.ts';
import type { Field } from './fields.ts';
import type { Message, Scenario, Rule, Scope } from './types.ts';

export interface Difference {
  path: string;
  expected: string;
  actual: string;
}
const value = (raw: string) => (raw[0] === '"' ? JSON.parse(raw) : raw);
function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v)) return false;
  const date = new Date(v.slice(0, 10) + 'T00:00:00Z');
  return (
    Number.isFinite(Date.parse(v)) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === v.slice(0, 10)
  );
}
function matches(
  rule: Rule,
  field: Field | undefined,
  expected: Field | undefined,
  reference: Message,
): boolean {
  if (!field) return false;
  const raw = field.raw;
  if (rule.operator === 'present') return true;
  if (rule.operator === 'date') return typeof value(raw) === 'string' && validDate(value(raw));
  if (rule.operator === 'reference') {
    const other = messageFields(reference.data, reference.mimeType).find((f) => f.path === rule.value);
    return !!other && other.type === field.type && value(other.raw) === value(raw);
  }
  return !!expected && field.type === expected.type && String(value(raw)) === rule.value;
}
export function checkMessage(
  actual: string,
  expected: Message,
  scenario: Scenario,
  caseId: string,
  scope: Scope,
  reference: Message,
): Difference[] {
  const rules = scenario.rules.filter((r) => r.caseId === caseId && r.scope === scope),
    rows: Difference[] = [];
  try {
    const fields = messageFields(actual, expected.mimeType);
    if (scenario.comparison !== 'rules') {
      const equal =
        scenario.comparison === 'xml-structure' && expected.mimeType === 'application/xml'
          ? structuralXml(actual) === structuralXml(expected.data)
          : compareTestContent(actual, expected.data, expected.mimeType);
      if (!equal) rows.push(...contentDifferences(actual, expected.data, expected.mimeType));
    }
    if (scenario.comparison === 'rules' && !rules.length)
      rows.push({
        path: 'Prüfumfang',
        expected: 'Mindestens eine Erwartung für diese Nachricht',
        actual: 'Keine Erwartung hinterlegt',
      });
    const expectedFields = messageFields(expected.data, expected.mimeType);
    for (const rule of rules) {
      const field = fields.find((f) => f.path === rule.path);
      if (
        !matches(
          rule,
          field,
          expectedFields.find((f) => f.path === rule.path),
          reference,
        )
      )
        rows.push({
          path: rule.path,
          expected:
            rule.operator === 'equals'
              ? rule.value
              : rule.operator === 'present'
                ? 'Feld vorhanden'
                : rule.operator === 'date'
                  ? 'Gültiges Datum'
                  : `Wie Antragsfeld ${rule.value}`,
          actual: field === undefined ? 'Feld fehlt' : field.raw.slice(0, 300),
        });
    }
  } catch {
    rows.push({
      path: 'Dokument',
      expected: 'Gültiger, eindeutig lesbarer Inhalt',
      actual: 'Inhalt oder Erwartung kann nicht geprüft werden',
    });
  }
  return rows;
}
export { validDate };
