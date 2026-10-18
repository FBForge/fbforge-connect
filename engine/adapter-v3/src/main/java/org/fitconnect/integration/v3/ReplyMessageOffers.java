package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.common.data.ObjectMappingHelper;
import dev.fitko.fitconnect.rest.model.metadata.Metadata;
import dev.fitko.fitconnect.rest.model.metadata.dataset.*;
import dev.fitko.fitconnect.rest.model.metadata.v3.MetadataV3;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Only verified metadata 3.x can authorize a process reply over its FIT-Connect channel. */
final class ReplyMessageOffers {
    static List<SubmissionInput.ProcessMessage> read(Metadata metadata) {
        if (!(metadata instanceof MetadataV3 current) || current.getDataSets() == null)
            return List.of();
        var datasets =
                current.getDataSets().stream()
                        .filter(
                                item ->
                                        item.schema() != null
                                                && SdkSettings.REPLY_CHANNEL_DATASET_SCHEMA_URI
                                                        .equals(item.schema().schemaUri()))
                        .toList();
        if (datasets.isEmpty()) return List.of();
        if (datasets.size() != 1) throw new SessionException("verification_failed");
        try {
            var data =
                    ObjectMappingHelper.fromString(
                            datasets.getFirst().content(), ReplyChannelDataSet.class);
            if (data.messages() == null) return List.of();
            if (data.messages().size() > 16) throw new SessionException("verification_failed");
            var messages = new ArrayList<SubmissionInput.ProcessMessage>();
            for (var row : data.messages()) {
                if (row == null || row.replyChannel() == null)
                    throw new SessionException("verification_failed");
                if (row.replyChannel() == ReplyChannelType.FIT_CONNECT) {
                    var message =
                            new SubmissionInput.ProcessMessage(
                                    row.processModelId(), row.messageId());
                    if (messages.contains(message))
                        throw new SessionException("verification_failed");
                    messages.add(message);
                }
            }
            return List.copyOf(messages);
        } catch (Exception failure) {
            throw new SessionException("verification_failed");
        }
    }

    private ReplyMessageOffers() {}
}
