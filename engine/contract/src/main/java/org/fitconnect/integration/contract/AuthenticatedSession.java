package org.fitconnect.integration.contract;

import java.util.List;

/** Native SDK state. No method exports credentials, tokens or SDK objects to the renderer. */
public interface AuthenticatedSession extends AutoCloseable {
    void check();
    default String publicSchema(String uri) { throw new SessionException("schema_unavailable"); }
    default String publicSchema(String uri, java.util.Map<String,String> local, boolean allowExternal) {
        if (!local.isEmpty() || !allowExternal) throw new SessionException("schema_unavailable");
        return publicSchema(uri);
    }
    /** Offline validation against an exact native-loaded schema package; no resolver may fetch. */
    default boolean validateDraft(SchemaSnapshot snapshot, String mimeType, byte[] data) { throw new SessionException("schema_unavailable"); }
    String destinations(int offset, int limit);
    String destination(String destinationId);
    default String ownDestination(String destinationId) { throw new SessionException("invalid_input"); }
    default String patchOwnDestination(String destinationId, String patch, ResourceExchange authorized) { throw new SessionException("invalid_input"); }
    default String ownDestinationKeys(String destinationId, int offset, int limit) { return destinationKeys(destinationId, offset, limit); }
    String destinationKeys(String destinationId, int offset, int limit);
    SubmissionPage submissions(String destinationId, int offset, int limit);
    ReplyPage replies(int offset, int limit);
    SubmissionInfo submission(String submissionId);
    ReceivedContent receive(String destinationId, String submissionId, ResourceExchange readTransport,
            java.nio.file.Path workspace, java.util.Map<String,String> schemas);
    ReceivedReplyContent receiveReply(java.util.UUID caseId, java.util.UUID replyId, ReplySource readTransport,
            java.nio.file.Path workspace, java.util.Map<String,String> schemas);
    PreparedReplyReceipt prepareReplyReceipt(ReplyReceiptRequest request, ReplyReceiptEvidence evidence);
    java.util.UUID sendReplyReceipt(PreparedReplyReceipt prepared, ResourceExchange authorized, java.nio.file.Path workspace);
    KeyReference importKey(String destinationId, String purpose, String document, List<String> eligiblePublicJwks);
    List<KeyReference> loadedKeys();
    /** Remove imported keys no longer matching the freshly checked public TEST registrations. */
    void retainKeys(String destinationId, List<String> eligiblePublicJwks);
    void discardReceived();
    ReceiptEvidence receiptEvidence(String destinationId, String submissionId);
    /** Verified native context only, never a renderer DTO or an unverified submission lookup. */
    ReplyRecipient replyRecipient(String destinationId, String submissionId);
    /** The host supplies a one-shot reply transport after user confirmation. No SDK default HTTP. */
    ReplyResult sendReply(ReplyInput input, java.nio.file.Path workspace, ResourceExchange authorizedTransport);
    SignedReceipt signReceipt(ReceiptRequest request, java.nio.file.Path workspace);
    /** Native host must supply the exact confirmed token and a one-shot, case-bound transport. */
    void sendReceipt(SignedReceipt receipt, ResourceExchange authorizedTransport);
    VerifiedEventLog eventLog(java.util.UUID destinationId, java.util.UUID caseId, java.util.UUID submissionId,
            EventLogSource source, java.nio.file.Path workspace);
    default VerifiedEventLog replyEventLog(java.util.UUID caseId, java.util.UUID replyId, EventLogSource source, java.nio.file.Path workspace) {
        throw new SessionException("invalid_input");
    }
    default VerifiedCaseEventLog caseEventLog(java.util.UUID caseId, EventLogSource source, java.nio.file.Path workspace) {
        throw new SessionException("invalid_input");
    }
    /** Private persistence bridge; these methods are not renderer IPC commands. */
    default void checkGeneratedTestKey(String purpose, GeneratedTestKey key) { throw new SessionException("invalid_input"); }
    default GeneratedTestKey generateTestKey(String purpose) { throw new SessionException("invalid_input"); }
    default String canonicalDestinationMutation(String kind, String document) { throw new SessionException("invalid_input"); }
    default String createOwnDestination(String document, ResourceExchange authorized) { throw new SessionException("invalid_input"); }
    default void deleteOwnDestination(String destinationId, ResourceExchange authorized) { throw new SessionException("invalid_input"); }
    default void registerOwnDestinationKey(String destinationId, String publicJwk, ResourceExchange authorized) { throw new SessionException("invalid_input"); }
    default List<SessionKeyArchive> archiveKeys() { throw new SessionException("invalid_input"); }
    default void restoreReplyKey(SessionKeyArchive item, java.nio.file.Path workspace) { throw new SessionException("invalid_input"); }
    default void prepareReplyChannel(java.util.UUID attemptId, SubmissionInput input, java.nio.file.Path workspace) { throw new SessionException("invalid_input"); }
    void discardKeys();
    /** The host must supply a private session workspace and a write-authorized transport. */
    SendResult send(SubmissionInput input, java.nio.file.Path workspace, java.util.UUID attemptId);
    default SendResult send(SubmissionInput input, java.nio.file.Path workspace) {
        if (input != null && input.replyOffer() != null) throw new SessionException("invalid_input");
        return send(input, workspace, java.util.UUID.randomUUID());
    }
    List<ReplyChannelReference> replyChannels();
    /** Only the native write gate supplies identifiers from its validated announcement response. */
    void completeReplyChannel(java.util.UUID attemptId, java.util.UUID caseId, java.util.UUID submissionId, boolean retain);
    @Override void close();
}
