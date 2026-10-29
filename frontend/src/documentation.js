export const documentationRoot = 'https://fbforge.de/connect/hilfe/0.3';
export const documentationTopics = Object.freeze([
  { id: 'start', title: 'Schnellstart' },
  { id: 'connection', title: 'Verbinden und Profile' },
  { id: 'send', title: 'Einreichung senden' },
  { id: 'receive', title: 'Antrag empfangen und prüfen' },
  { id: 'replies', title: 'Antworten testen' },
  { id: 'cases', title: 'Vorgänge und Aufbewahrung' },
  { id: 'attachments', title: 'PDF, Bilder und Dateien' },
  { id: 'processes', title: 'BPMN und Prozessnachrichten' },
  { id: 'destinations', title: 'Eigene Destinations verwalten' },
  { id: 'events', title: 'Event Log und Nachverfolgung' },
  { id: 'diagnostics', title: 'Technische Aufrufe verstehen' },
  { id: 'problems', title: 'Probleme verstehen und beheben' },
  { id: 'accessibility', title: 'Tastatur und Lesbarkeit' },
  { id: 'tools', title: 'Testpakete und Schema-Vergleich' },
]);
export function documentationUrl(topic = 'start') {
  if (!documentationTopics.some((item) => item.id === topic)) throw new Error('invalid_input');
  return `${documentationRoot}/${topic}`;
}
