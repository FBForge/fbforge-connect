// Benign fixture for real TEST receipt interoperability, never a malware-detection test.
// Real EICAR detection is tested separately against the pinned ClamAV engine.
import { randomUUID } from 'node:crypto';
export const SCANNER_PROBLEM_TEXT = 'Fiktive harmlose Anlage für den kontrollierten ICAP-Test.';
const acceptEvent = 'https://schema.fitko.de/fit-connect/events/accept-submission';
const check = (value, code) => {
  if (!value) throw new Error(code);
};
export function scannerFixture({ openSender, receiver, upload, destination, service, schemaUri, from }) {
  return {
    async sendScannerFixture(api) {
      const sender = await openSender(api);
      const text = JSON.stringify({
        antragstellendePerson: { vorname: 'Erika', nachname: 'Musterfrau' },
        anliegen: 'Fiktiver TEST-Antrag zur Annahme mit Anlagenproblemen',
        referenz: randomUUID(),
      });
      // The native protocol intentionally permits only one request in flight.
      const attachments = [];
      for (const [fileName, bytes] of [
        ['controlled-finding.txt', SCANNER_PROBLEM_TEXT],
        ['clean-scanner-fixture.txt', 'Fiktive saubere TEST-Anlage.'],
      ]) {
        attachments.push({
          contentId: await upload(sender, bytes),
          fileName,
          mimeType: 'text/plain',
          description: 'Harmlose Anlage für den kontrollierten Scanner-Test',
        });
      }
      const draft = {
        destinationId: destination,
        fromDestinationId: api === 'v3' ? from : null,
        serviceIdentifier: service,
        serviceName: 'Fiktiver TEST-Antrag',
        region: 'DE',
        schemaUri,
        mimeType: 'application/json',
        caseId: null,
        processMessage: null,
        replyOffer: null,
        contentId: await upload(sender, text),
        attachments,
      };
      const prepared = await sender.call('prepare_send', { sendDocument: JSON.stringify(draft) });
      const sent = await sender.call('execute_send', { attemptId: prepared.attempt.attemptId });
      check(sent.status === 'sent', 'scanner_fixture_send_failed');
      return { api, text, submissionId: sent.submissionId, caseId: sent.caseId };
    },
    async verifyScannerReceipt(message, attachmentId) {
      const engine = receiver(message.api);
      for (let attempt = 0; attempt < 10; attempt++) {
        const log = await engine.call('load_event_log', {
          destinationId: destination,
          submissionId: message.submissionId,
          caseId: message.caseId,
        });
        for (let offset = 0; offset < log.total; offset += 5) {
          const page = await engine.call('list_event_log', { logId: log.logId, offset });
          for (const entry of page.events.filter((item) => item.eventType === acceptEvent)) {
            const chunks = [];
            for (let byteOffset = 0; byteOffset < entry.claimsBytes;) {
              const part = await engine.call('read_event_log', {
                logId: log.logId,
                eventId: entry.eventId,
                part: 'claims',
                byteOffset,
              });
              const bytes = Buffer.from(part.chunk, 'base64');
              check(
                bytes.length && byteOffset + bytes.length <= entry.claimsBytes,
                'scanner_receipt_chunk_invalid',
              );
              chunks.push(bytes);
              byteOffset += bytes.length;
            }
            const problems = JSON.parse(Buffer.concat(chunks).toString('utf8')).events?.[acceptEvent]
              ?.problems;
            check(
              problems?.length === 1 &&
                problems[0].type === 'https://schema.fitko.de/fit-connect/events/problems/invalid-content' &&
                problems[0].instance === `attachment:${attachmentId}`,
              'scanner_receipt_problem_missing',
            );
            console.log(
              `Real TEST ${message.api}: signed acceptance contains exactly the controlled attachment problem`,
            );
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error('scanner_receipt_event_missing');
    },
  };
}
