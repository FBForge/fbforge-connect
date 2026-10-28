export const warning = (stage: string): string =>
  new Map([
    ['MALWARE_SCAN_NOT_CONFIGURED', 'Kein Malwarescanner eingerichtet.'],
    ['XML_SCHEMA_NOT_CHECKED', 'XML-Syntax geprüft. Eine XSD-Prüfung wurde nicht durchgeführt.'],
  ]).get(stage) || `SDK-Prüfhinweis: ${stage}`;
export const label = (part: { kind: string; fileName?: string }): string =>
  part.kind === 'metadata' ? 'Metadaten' : part.kind === 'data' ? 'Fachdaten' : part.fileName || 'Anlage';
export const bytesLabel = (value: number): string =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${(value / 1024 / 1024).toFixed(1)} MiB`;
