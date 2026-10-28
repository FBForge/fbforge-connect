import type { Ref } from 'vue';
import type { Session } from '../contracts.ts';
type AddressField =
  | 'target'
  | 'source'
  | 'service'
  | 'serviceName'
  | 'region'
  | 'schema'
  | 'mime'
  | 'caseId'
  | 'addressing'
  | 'modelId'
  | 'messageId'
  | 'replySchema'
  | 'replyMime';
type SendDraftRefs = Record<AddressField, Ref<string>> & {
  offerReplies: Ref<boolean>;
  offeredProcessMessages: Ref<{ processModelId: string; messageId: string }[]>;
};

/** Creates a plain snapshot. Subsequent edits cannot change a prepared native attempt. */
export function snapshotSendDraft(session: Session, draft: SendDraftRefs) {
  const {
    target,
    source,
    service,
    serviceName,
    region,
    schema,
    mime,
    caseId,
    addressing,
    modelId,
    messageId,
    replySchema,
    replyMime,
    offerReplies,
    offeredProcessMessages,
  } = draft;
  return {
    destinationId: target.value.trim().toLowerCase(),
    fromDestinationId: session.apiVersion === 'v3' ? source.value.trim().toLowerCase() : null,
    serviceIdentifier: service.value.trim(),
    serviceName: serviceName.value.trim(),
    region: region.value.trim() || null,
    schemaUri: schema.value.trim(),
    mimeType: mime.value,
    caseId: caseId.value.trim().toLowerCase() || null,
    processMessage:
      session.apiVersion === 'v3' && addressing.value === 'process'
        ? { processModelId: modelId.value.trim(), messageId: messageId.value.trim() }
        : null,
    replyOffer: offerReplies.value
      ? {
          schemaUri: replySchema.value.trim(),
          mimeType: replyMime.value,
          processMessages: session.apiVersion === 'v3' ? offeredProcessMessages.value : [],
        }
      : null,
  };
}
