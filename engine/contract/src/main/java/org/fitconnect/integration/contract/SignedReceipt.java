package org.fitconnect.integration.contract;

import java.util.UUID;

/** Native-only SDK token. This is not a renderer response or permission to write it to FIT-Connect. */
public record SignedReceipt(UUID destinationId, UUID submissionId, UUID caseId, String action, String signingKid, String jwt) {
    public SignedReceipt {
        if (destinationId == null || submissionId == null || caseId == null || !("accept".equals(action) || "reject".equals(action))
                || signingKid == null || signingKid.isBlank() || signingKid.length() > 512 || jwt == null || jwt.length() > 64 * 1024
                || !jwt.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) throw new SessionException("verification_failed");
    }
    @Override public String toString() { return "SignedReceipt[token omitted]"; }
}
