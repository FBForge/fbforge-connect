import { clone, scenarioFrom } from './model.ts';
import { synchronizeReplyOffers } from './response-offers.ts';
import type { Pack } from './types.ts';
export function receiptExample(pack: Pack, kind: 'accept' | 'reject' | 'reply') {
  const value = clone(pack);
  value.cases = value.cases.slice(0, 1);
  value.cases[0].receipt = kind === 'reject' ? 'reject' : 'accept';
  if (kind !== 'reply') {
    value.cases[0].reply = null;
    value.cases[0].request.replyOffer = null;
  }
  value.name =
    kind === 'reject'
      ? 'Erwartete Ablehnung'
      : kind === 'reply'
        ? 'Einreichung mit Antwort'
        : 'Einreichung annehmen';
  return value;
}
export function processDialog(pack: Pack) {
  const value = clone(pack),
    first = value.cases[0];
  value.cases = [first];
  const processModelId = 'urn:fbforge:connect:process:test:1';
  first.name = 'Antrag, Bearbeitungsstand und Nachforderung';
  first.request.serviceIdentifier = '';
  first.request.processMessage = { processModelId, messageId: 'antrag' };
  const reply = first.reply!;
  reply.data = JSON.stringify({
    status: 'in_bearbeitung',
    nachricht: 'Der fiktive Antrag wird bearbeitet.',
  });
  reply.processMessage = { processModelId, messageId: 'bearbeitungsstand' };
  first.request.replyOffer!.processMessages = [reply.processMessage];
  const next = clone(first);
  next.id = 'nachreichung';
  next.name = 'Unterlagen nachreichen';
  next.request.processMessage = { processModelId, messageId: 'nachreichung' };
  next.reply!.data = JSON.stringify({
    status: 'abgeschlossen',
    nachricht: 'Die fiktiven Unterlagen sind vollständig.',
  });
  next.reply!.processMessage = { processModelId, messageId: 'abschluss' };
  next.request.replyOffer!.processMessages = [next.reply!.processMessage];
  value.cases.push(next);
  value.name = 'Nachforderung und Nachreichung';
  const s = scenarioFrom(value);
  s.sharedCase = true;
  s.followups = [
    {
      id: crypto.randomUUID(),
      caseId: first.id,
      name: 'Unterlagen nachfordern',
      message: {
        ...clone(reply),
        data: JSON.stringify({
          status: 'unterlagen_erforderlich',
          nachricht: 'Bitte den fiktiven Nachweis nachreichen.',
        }),
        processMessage: { processModelId, messageId: 'nachforderung' },
      },
    },
  ];
  synchronizeReplyOffers(s);
  return s;
}
