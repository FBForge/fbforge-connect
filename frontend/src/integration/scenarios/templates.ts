import { clone, scenarioFrom } from './model.ts';
import type { Pack } from './types.ts';
export function processDialog(pack: Pack) {
  const value = clone(pack),
    first = value.cases[0];
  value.cases = [first];
  const processModelId = 'urn:fbforge:connect:process:test:1';
  first.name = 'Antrag und Nachforderung';
  first.request.serviceIdentifier = '';
  first.request.processMessage = { processModelId, messageId: 'antrag' };
  const reply = first.reply!;
  reply.data = JSON.stringify({
    status: 'unterlagen_erforderlich',
    nachricht: 'Bitte den fiktiven Nachweis nachreichen.',
  });
  reply.processMessage = { processModelId, messageId: 'nachforderung' };
  first.request.replyOffer!.processMessages = [reply.processMessage];
  const next = clone(first);
  next.id = 'nachreichung';
  next.name = 'Unterlagen nachreichen';
  next.request.processMessage = { processModelId, messageId: 'nachreichung' };
  next.request.replyOffer = null;
  next.reply = null;
  value.cases.push(next);
  value.name = 'Nachforderung und Nachreichung';
  const s = scenarioFrom(value);
  s.sharedCase = true;
  return s;
}
