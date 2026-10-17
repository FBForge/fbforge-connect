import { annotateJsonSchema } from './schema-json-annotations.js';
import { annotateXmlSchema } from './schema-xml-annotations.js';

export const SCHEMA_VIEW_BYTES = 8 * 1024 * 1024;
import { object, resolveUri } from './schema-hints.js';
export function annotateSchema(model, document, schemaUri, Parser = globalThis.DOMParser) {
  const fallback = (status, message) => ({
    root: model.root,
    status,
    message,
    schemaUri: schemaUri || null,
    matchedCount: 0,
    labelCount: 0,
    ambiguousCount: 0,
  });
  if (!model.root)
    return fallback('unavailable', 'Für diese Daten steht keine Formularzuordnung zur Verfügung.');
  if (!document || !schemaUri)
    return fallback(
      'unavailable',
      'Keine Schema-Beschriftungen geladen. Originalfeldnamen bleiben sichtbar.',
    );
  if (
    typeof document !== 'string' ||
    document.length > SCHEMA_VIEW_BYTES ||
    new TextEncoder().encode(document).length > SCHEMA_VIEW_BYTES
  )
    return fallback(
      'limited',
      'Die Schemaquellen überschreiten die Darstellungsgrenze von 8 MiB. Originalfeldnamen bleiben sichtbar.',
    );
  try {
    const packet = JSON.parse(document);
    if (
      !object(packet) ||
      packet.schemaPackage !== 1 ||
      packet.schemaUri !== schemaUri ||
      !resolveUri(schemaUri, schemaUri)
    )
      return fallback('unavailable', 'Das Schema-Paket passt nicht zur ausgewählten Schema-URI.');
    const result =
      model.format === 'json' && object(packet.documents)
        ? annotateJsonSchema(model.root, packet)
        : model.format === 'xml' && Array.isArray(packet.schemas)
          ? annotateXmlSchema(model.root, packet, Parser)
          : null;
    if (!result) return fallback('unavailable', 'Das Schemaformat passt nicht zu den Fachdaten.');
    return {
      ...result,
      schemaUri,
      message: result.matchedCount
        ? `${result.matchedCount} Schema-Zuordnungen · ${result.labelCount} Bezeichnungen aus dem Schema${result.ambiguousCount ? ` · ${result.ambiguousCount} mehrdeutige Zuordnungen` : ''}`
        : 'Keine eindeutige Schema-Zuordnung gefunden. Originalfeldnamen bleiben sichtbar.',
    };
  } catch {
    return fallback(
      'limited',
      'Die Schemaquellen konnten nicht vollständig für die Ansicht aufgelöst werden. Originalfeldnamen bleiben sichtbar.',
    );
  }
}
