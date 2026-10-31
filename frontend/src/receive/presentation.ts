export const warning = (stage: string): string =>
  new Map([
    [
      'MALWARE_SCAN_PASSED',
      'Metadaten, Fachdaten und Anlagen wurden vom eingerichteten Scanner freigegeben.',
    ],
    [
      'MALWARE_ATTACHMENT_BLOCKED',
      'Anlagen wurden vom Virenscan gesperrt. Eine Annahme meldet Anlagenprobleme.',
    ],
    ['MALWARE_SCAN_NOT_CONFIGURED', 'Kein Malwarescanner eingerichtet.'],
    ['XML_SCHEMA_NOT_CHECKED', 'XML-Syntax geprüft. Eine XSD-Prüfung wurde nicht durchgeführt.'],
    ['DATA_SCHEMA_INVALID', 'Die Fachdaten weichen vom Schema ab. Prüfen Sie die markierten Angaben.'],
  ]).get(stage) || `SDK-Prüfhinweis: ${stage}`;
export const label = (part: { kind: string; fileName?: string }): string =>
  part.kind === 'metadata' ? 'Metadaten' : part.kind === 'data' ? 'Fachdaten' : part.fileName || 'Anlage';
export const bytesLabel = (value: number): string =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${(value / 1024 / 1024).toFixed(1)} MiB`;

export function generalWarnings(warnings: string[]) {
  return warnings.filter((code) => !['MALWARE_SCAN_NOT_CONFIGURED', 'MALWARE_SCAN_PASSED'].includes(code));
}
