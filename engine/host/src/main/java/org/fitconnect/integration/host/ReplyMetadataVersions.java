package org.fitconnect.integration.host;

import com.google.gson.JsonObject;
import org.fitconnect.integration.contract.SessionException;

/** A reply reader must advertise an SDK-writable version; never infer one from its type. */
final class ReplyMetadataVersions {
    static void require(JsonObject destination, boolean processMessage) {
        var versions = destination.get("metadataVersions");
        if (versions != null && versions.isJsonArray())
            for (var version : versions.getAsJsonArray())
                if (version.isJsonPrimitive()
                        && version.getAsJsonPrimitive().isString()
                        && ("3.0.0".equals(version.getAsString())
                                || !processMessage && "2.0.0".equals(version.getAsString())))
                    return;
        throw new SessionException("reply_metadata_required");
    }
}
