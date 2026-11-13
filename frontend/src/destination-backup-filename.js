/** A descriptive, Windows-safe suggestion. The native file dialog remains authoritative. */
export function destinationBackupFilename(summary) {
  const name =
    (summary.destinationName || summary.name || 'Zustellpunkt')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'Zustellpunkt';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(summary.capturedAt))
      .map((part) => [part.type, part.value]),
  );
  return `${name}_${summary.sourceDestinationId}_${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}_Berlin.json`;
}
