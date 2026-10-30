const fields = [
  'installed',
  'ready',
  'enabled',
  'automaticUpdates',
  'engineVersion',
  'databaseVersion',
  'databaseCreatedAt',
  'databaseAgeDays',
  'lastUpdate',
  'updateFailed',
  'busy',
  'operation',
  'error',
  'downloadedBytes',
  'downloadTotalBytes',
];
const phases = new Set([
  '',
  'initializing',
  'starting',
  'stopping',
  'saving',
  'installing',
  'downloading',
  'updating-database',
]);
export function checkedLocalScanner(value) {
  const fail = () => {
    throw new Error('engine_protocol_error');
  };
  if (
    !value ||
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(value, key))
  )
    fail();
  for (const key of ['installed', 'ready', 'enabled', 'automaticUpdates', 'updateFailed', 'busy'])
    if (typeof value[key] !== 'boolean') fail();
  if (
    typeof value.engineVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(value.engineVersion) ||
    !phases.has(value.operation) ||
    (value.error !== null &&
      (typeof value.error !== 'string' || !/^(scanner_[a-z_]+|content_cancelled)$/.test(value.error)))
  )
    fail();
  for (const key of ['databaseVersion', 'databaseCreatedAt', 'databaseAgeDays', 'lastUpdate'])
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0)) fail();
  if (
    !Number.isSafeInteger(value.downloadedBytes) ||
    !Number.isSafeInteger(value.downloadTotalBytes) ||
    value.downloadedBytes < 0 ||
    value.downloadedBytes > value.downloadTotalBytes ||
    value.downloadTotalBytes < 0 ||
    value.downloadTotalBytes > 512 * 1024 * 1024
  )
    fail();
  if (
    value.ready &&
    (!value.installed || !value.enabled || value.databaseVersion === null || value.databaseCreatedAt === null)
  )
    fail();
  return Object.freeze({ ...value });
}

export function scannerError(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return (
    {
      content_cancelled: 'Vorgang abgebrochen. Ein gültiger vorheriger Bestand bleibt erhalten.',
      scanner_busy: 'Der lokale Scanner wird gerade eingerichtet oder aktualisiert. Bitte warten Sie kurz.',
      scanner_unsupported: 'Der mitgelieferte lokale Scanner wird derzeit nur unter Windows x64 unterstützt.',
      scanner_database_missing:
        'Virensignaturen fehlen. Bitte Signaturen herunterladen oder die offiziellen CVD-Dateien mit ihren .sign-Dateien importieren.',
      scanner_database_invalid:
        'Die Signaturdatenbanken konnten nicht als gültig bestätigt werden. Der bisherige Bestand wird nicht ersetzt.',
      scanner_database_rollback:
        'Das Paket enthält ältere Signaturen als der vorhandene Bestand und wurde nicht übernommen.',
      scanner_package_invalid:
        'Das Paket ist beschädigt, verändert oder nicht für diese freigegebene Scanner-Version bestimmt.',
      scanner_start_failed:
        'Der lokale Scanner konnte nicht betriebsbereit gestartet werden. Es liegt kein erfolgreicher Scan vor.',
      scanner_download_failed:
        'Das Scanner-Paket konnte nicht vollständig heruntergeladen werden. Bitte Internetzugang und Proxy prüfen oder ein Offline-Paket verwenden.',
      scanner_update_failed:
        'Die Signaturaktualisierung ist fehlgeschlagen. Ein vorhandener gültiger Bestand bleibt erhalten.',
      scanner_configuration_invalid:
        'Die lokale Scanner-Konfiguration konnte nicht gelesen werden. Bitte die lokale Installation prüfen.',
      scanner_install_failed:
        'Die Scanner-Einrichtung konnte nicht abgeschlossen werden. Bitte freien Speicher und Zugriffsrechte prüfen.',
    }[code] || 'Der lokale Scanner konnte nicht eingerichtet werden. Es liegt keine erfolgreiche Prüfung vor.'
  );
}
