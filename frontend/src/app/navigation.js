export const navigation = [
  {
    name: 'Start',
    icon: 'home',
    description: 'Verbinden Sie Ihren Zugang und wählen Sie die passende Aufgabe.',
  },
  {
    name: 'Senden',
    icon: 'send',
    description: 'Einreichungen mit Fachdaten und Anlagen vorbereiten und an FIT-Connect übermitteln.',
  },
  {
    name: 'Empfangen',
    icon: 'receive',
    description: 'Einreichungen abrufen, lokal entschlüsseln und technisch prüfen.',
  },
  {
    name: 'Vorgänge',
    icon: 'cases',
    description: 'Gesendete und empfangene Anträge, Antworten und Anlagen lokal wieder öffnen.',
  },
  {
    name: 'Destinations',
    group: 'Test und Verwaltung',
    icon: 'destinations',
    description: 'Eigene Destinations ansehen und über API v3 verwalten.',
  },
  {
    name: 'Prozesse',
    group: 'Test und Verwaltung',
    icon: 'process',
    description: 'BPMN-Nachrichten auswählen und passende Prozess-Destinations finden.',
  },
  {
    name: 'Event Log',
    group: 'Test und Verwaltung',
    icon: 'history',
    description: 'Den Verlauf von Vorgängen, Einreichungen und Antworten nachvollziehen.',
  },
  {
    name: 'Testwerkzeuge',
    group: 'Test und Verwaltung',
    icon: 'tools',
    description: 'Testfälle lokal wiederverwenden und Änderungen an JSON-Schemata und XSDs vergleichen.',
  },
  {
    name: 'Hilfe',
    group: 'Hilfe und Anwendung',
    icon: 'help',
    description: 'Anleitungen und Beispiele auf der FBForge-Website.',
  },
  {
    name: 'Diagnose',
    group: 'Hilfe und Anwendung',
    icon: 'diagnostics',
    description: 'Lokale Komponenten prüfen und einen technischen Bericht für die Fehleranalyse speichern.',
  },
  {
    name: 'Info',
    group: 'Hilfe und Anwendung',
    icon: 'info',
    description: 'Programmversion, Funktionsumfang und Lizenzinformationen.',
  },
];
export const navigationGroups = ['Arbeitsbereich', 'Test und Verwaltung', 'Hilfe und Anwendung'].map(
  (name) => ({
    name,
    items: navigation.filter((item) => (item.group || 'Arbeitsbereich') === name),
  }),
);
