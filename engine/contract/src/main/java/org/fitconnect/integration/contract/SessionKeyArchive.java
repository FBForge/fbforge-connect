package org.fitconnect.integration.contract;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Native-to-native persistence item. Never expose this record through a renderer command or
 * diagnostic.
 */
public record SessionKeyArchive(
        KeyReference destinationKey,
        ReplyChannelReference replyChannel,
        UUID expectedCase,
        String privateJwk,
        URI schemaUri,
        String mimeType,
        GeneratedKeyReference generatedKey,
        List<SubmissionInput.ProcessMessage> replyMessages) {
    public SessionKeyArchive(
            KeyReference destinationKey,
            ReplyChannelReference replyChannel,
            UUID expectedCase,
            String privateJwk,
            URI schemaUri,
            String mimeType,
            GeneratedKeyReference generatedKey) {
        this(
                destinationKey,
                replyChannel,
                expectedCase,
                privateJwk,
                schemaUri,
                mimeType,
                generatedKey,
                List.of());
    }

    public SessionKeyArchive(
            KeyReference destinationKey,
            ReplyChannelReference replyChannel,
            UUID expectedCase,
            String privateJwk,
            URI schemaUri,
            String mimeType) {
        this(
                destinationKey,
                replyChannel,
                expectedCase,
                privateJwk,
                schemaUri,
                mimeType,
                null,
                List.of());
    }

    public SessionKeyArchive {
        replyMessages = replyMessages == null ? List.of() : List.copyOf(replyMessages);
        if (replyChannel == null && !replyMessages.isEmpty()) invalid();
        if (replyChannel != null)
            new SubmissionInput.ReplyOffer(schemaUri, mimeType, replyMessages);
        if ((destinationKey == null ? 0 : 1)
                                + (replyChannel == null ? 0 : 1)
                                + (generatedKey == null ? 0 : 1)
                        != 1
                || privateJwk == null
                || privateJwk.getBytes(StandardCharsets.UTF_8).length > 24000
                || !privateJwk.startsWith("{")) invalid();
        if (destinationKey != null) {
            if (expectedCase != null
                    || schemaUri != null
                    || mimeType != null
                    || destinationKey.destinationId() == null
                    || !Set.of("decrypt", "sign").contains(destinationKey.purpose())
                    || destinationKey.kid() == null
                    || destinationKey.kid().isBlank()
                    || destinationKey.kid().length() > 512
                    || destinationKey.kid().chars().anyMatch(c -> c < 32 || c == 127)) invalid();
            try {
                if (!UUID.fromString(destinationKey.destinationId())
                        .toString()
                        .equals(destinationKey.destinationId())) invalid();
            } catch (IllegalArgumentException failure) {
                invalid();
            }
        } else if (generatedKey != null) {
            if (expectedCase != null || schemaUri != null || mimeType != null) invalid();
        } else if (schemaUri == null
                || !schemaUri.isAbsolute()
                || schemaUri.toString().length() > 4096
                || !Set.of("application/json", "application/xml").contains(mimeType)) invalid();
    }

    @Override
    public String toString() {
        return "SessionKeyArchive[private material omitted]";
    }

    private static void invalid() {
        throw new SessionException("invalid_input");
    }
}
