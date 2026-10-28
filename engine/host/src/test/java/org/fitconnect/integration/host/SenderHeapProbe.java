package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.lang.management.ManagementFactory;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

/** Runs in a separate JVM with the desktop heap budget. */
class SenderHeapProbe extends SenderTestSupport {
    /** Separate bounded JVM, synthetic input and HTTP sink, no FIT-Connect connection. */
    public static void main(String[] args) throws Exception {
        try {
            ApiVersion api = ApiVersion.parse(args[0]);
            Path directory = Path.of(args[1]);
            fixture(directory);
            var remote = new SenderCapture(api.wireValue());
            remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
            remote.countOnly = true;
            try (var adapters = registry();
                    var content = new ContentStore(directory)) {
                ApiVersion otherApi = api == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2;
                var otherRemote = new SenderCapture(otherApi.wireValue());
                otherRemote.metadata = otherApi == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var otherAccess = new SendAccess(otherApi, otherRemote);
                try (var otherSession =
                        adapters.openSession(
                                otherApi,
                                "synthetic-id",
                                "synthetic-secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                otherAccess)) {
                    var original = input(null, null);
                    var warm =
                            new SubmissionInput(
                                    otherApi == ApiVersion.V3 ? SOURCE : null,
                                    TARGET,
                                    SERVICE,
                                    original.serviceName(),
                                    original.region(),
                                    SCHEMA,
                                    "application/json",
                                    DATA,
                                    original.attachments(),
                                    null,
                                    null);
                    var first = otherAccess.prepare(warm);
                    var warmed =
                            adapters.withSession(
                                    otherApi,
                                    otherSession,
                                    s ->
                                            otherAccess.execute(
                                                    first.attemptId(),
                                                    s,
                                                    content.workspace("warm")));
                    if (!warmed.status().equals("sent"))
                        throw new IllegalStateException("Other SDK could not be initialized");
                    var access = new SendAccess(api, remote);
                    var prepared = access.prepare(maximumInput(api));
                    try (var session =
                            adapters.openSession(
                                    api,
                                    "synthetic-id",
                                    "synthetic-secret",
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    access)) {
                        var result =
                                adapters.withSession(
                                        api,
                                        session,
                                        s ->
                                                access.execute(
                                                        prepared.attemptId(),
                                                        s,
                                                        content.workspace("probe")));
                        System.out.println(
                                "status="
                                        + result.status()
                                        + " error="
                                        + result.error()
                                        + " bytes=67108864 maxHeapBytes="
                                        + Runtime.getRuntime().maxMemory()
                                        + " usedHeapBytesAtCompletion="
                                        + ManagementFactory.getMemoryMXBean()
                                                .getHeapMemoryUsage()
                                                .getUsed()
                                        + " uploads="
                                        + remote.uploadAttempts
                                        + " encryptedCharacters="
                                        + remote.encryptedCharacters
                                        + " maxUploadBytes="
                                        + remote.maxUploadBytes);
                        if (!result.status().equals("sent")
                                || remote.encryptedCharacters < 64L * 1024 * 1024
                                || remote.uploadAttempts <= 2
                                || remote.maxUploadBytes > 8 * 1024 * 1024) System.exit(3);
                    }
                }
            }
        } catch (OutOfMemoryError failure) {
            System.err.println("heap_exhausted");
            System.exit(5);
        }
    }
}
