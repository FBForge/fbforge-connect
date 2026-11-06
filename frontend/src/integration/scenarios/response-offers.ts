import type { Scenario } from './types.ts';

// The existing pack validator and normal reply composer enforce the same offer.
// Derive it from the messages being prepared, before an immutable run is created.
export function synchronizeReplyOffers(scenario: Scenario) {
  for (const item of scenario.pack.cases) {
    if (!item.request.replyOffer || !item.reply) continue;
    const messages = [
      item.reply,
      ...(scenario.followups || []).filter((f) => f.caseId === item.id).map((f) => f.message),
    ];
    const unique = new Map();
    for (const message of messages) {
      if (message.processMessage)
        unique.set(
          JSON.stringify([message.processMessage.processModelId, message.processMessage.messageId]),
          { ...message.processMessage },
        );
    }
    item.request.replyOffer.processMessages = [...unique.values()];
  }
}
