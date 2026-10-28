package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderPayloadTest extends SenderTestSupport {
    @Test
    void maximumPayloadFitsTheDesktopHeapForBothSdkVersions() throws Exception {
        String startup = Files.readString(Path.of("../../desktop/src/engine.rs"));
        var setting =
                java.util.regex.Pattern.compile("\\.arg\\(\"(-Xmx[0-9]+m)\"\\)").matcher(startup);
        assertTrue(setting.find(), "The probe must use the actual desktop JVM heap setting");
        String heap = setting.group(1);
        assertTrue(
                Integer.parseInt(heap.substring(4, heap.length() - 1)) <= 512,
                "The native heap budget must not silently grow beyond 512 MiB");
        String executable =
                System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java";
        for (ApiVersion api : ApiVersion.values()) {
            Path directory = Files.createDirectory(workspace.resolve(api.wireValue()));
            Path output = workspace.resolve(api.wireValue() + ".log");
            var builder =
                    new ProcessBuilder(
                                    Path.of(System.getProperty("java.home"), "bin", executable)
                                            .toString(),
                                    heap,
                                    "-cp",
                                    System.getProperty("java.class.path"),
                                    SenderHeapProbe.class.getName(),
                                    api.wireValue(),
                                    directory.toString())
                            .redirectErrorStream(true)
                            .redirectOutput(output.toFile());
            for (String key :
                    List.of("JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH"))
                builder.environment().remove(key);
            Process probe = builder.start();
            if (!probe.waitFor(120, TimeUnit.SECONDS)) {
                probe.destroyForcibly();
                fail("Bounded sender probe exceeded its time limit");
            }
            String evidence = Files.readString(output);
            System.out.println(api + " bounded sender: " + evidence.strip());
            assertEquals(0, probe.exitValue(), api + ": " + evidence);
            assertTrue(evidence.contains("status=sent"), evidence);
            assertTrue(evidence.contains("bytes=67108864"), evidence);
        }
    }

    @Test
    void bothSdkFragmentListsReconstructTheOriginalAttachmentAndMatchItsMetadataHash()
            throws Exception {
        byte[] attachment = new byte[10 * 1024 * 1024];
        new Random(42).nextBytes(attachment);
        try (var adapters = registry();
                var content = new ContentStore(workspace)) {
            for (ApiVersion api : ApiVersion.values()) {
                var remote = new SenderCapture(api.wireValue());
                remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var access = new SendAccess(api, remote);
                var request =
                        new SubmissionInput(
                                api == ApiVersion.V3 ? SOURCE : null,
                                TARGET,
                                SERVICE,
                                "Test",
                                "DE000000000000",
                                SCHEMA,
                                "application/json",
                                DATA,
                                List.of(
                                        new SubmissionInput.Attachment(
                                                "Anlage.bin",
                                                "application/octet-stream",
                                                "Fragmentiert",
                                                attachment)),
                                null,
                                null);
                Path sdkWorkspace = content.workspace(api.wireValue());
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                access)) {
                    var prepared = access.prepare(request);
                    assertEquals(
                            "sent",
                            adapters.withSession(
                                            api,
                                            session,
                                            s ->
                                                    access.execute(
                                                            prepared.attemptId(), s, sdkWorkspace))
                                    .status());
                    var metadata =
                            JsonParser.parseString(
                                            new String(
                                                    decrypt(
                                                            remote.submitted
                                                                    .get("encryptedMetadata")
                                                                    .getAsString()),
                                                    StandardCharsets.UTF_8))
                                    .getAsJsonObject();
                    var item =
                            metadata.getAsJsonObject("contentStructure")
                                    .getAsJsonArray("attachments")
                                    .get(0)
                                    .getAsJsonObject();
                    assertEquals("Anlage.bin", item.get("filename").getAsString());
                    assertEquals("Fragmentiert", item.get("description").getAsString());
                    var fragments = item.getAsJsonArray("fragments");
                    assertTrue(fragments.size() > 1);
                    assertEquals(fragments.size(), remote.uploads.size());
                    int offset = 0;
                    var digest = MessageDigest.getInstance("SHA-512");
                    for (var fragment : fragments) {
                        String endpoint =
                                remote.BASE
                                        + "/submissions/"
                                        + SUBMISSION
                                        + "/attachments/"
                                        + fragment.getAsString();
                        byte[] bytes = decrypt(remote.uploads.get(endpoint));
                        assertTrue(bytes.length <= 4 * 1024 * 1024);
                        assertArrayEquals(
                                Arrays.copyOfRange(attachment, offset, offset + bytes.length),
                                bytes);
                        offset += bytes.length;
                        digest.update(bytes);
                    }
                    assertEquals(attachment.length, offset);
                    assertEquals(
                            HexFormat.of().formatHex(digest.digest()),
                            item.getAsJsonObject("hash").get("content").getAsString());
                }
                content.clearWorkspace(api.wireValue());
                try (var files = Files.list(sdkWorkspace)) {
                    assertEquals(0, files.count());
                }
            }
        }
        try (var roots = Files.list(workspace)) {
            assertEquals(0, roots.count());
        }
    }
}
