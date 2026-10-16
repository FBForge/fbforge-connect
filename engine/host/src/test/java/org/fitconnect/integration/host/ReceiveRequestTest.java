package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiveRequestTest {
    private static String stage(ContentStore content, String owner, byte[] bytes) {
        String id = content.begin(owner, bytes.length).contentId();
        for (int offset = 0; offset < bytes.length; offset += ContentStore.CHUNK_BYTES)
            content.append(owner, id, offset, Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes, offset, Math.min(bytes.length, offset + ContentStore.CHUNK_BYTES))));
        return id;
    }
    private static String document(String uri, String id) {
        return new com.google.gson.Gson().toJson(Map.of("schemas", List.of(Map.of("uri", uri, "contentId", id))));
    }
    @Test void localCatalogResolvesOnlyCompleteOwnedHandlesAndPreservesSchemaText() {
        try (var content = new ContentStore()) {
            String schema = "{\n  \"type\":\"object\"\n}", id = stage(content, "owner", schema.getBytes(StandardCharsets.UTF_8));
            assertEquals(Map.of("urn:test:schema", schema), ReceiveRequest.resolve(document("urn:test:schema", id), content, "owner"));
            assertThrows(SessionException.class, () -> ReceiveRequest.resolve(document("urn:test:schema", id), content, "other"));
            String partial = content.begin("owner", 2).contentId();
            assertThrows(SessionException.class, () -> ReceiveRequest.resolve(document("urn:test:schema", partial), content, "owner"));
            assertEquals(Map.of(), ReceiveRequest.resolve("{\"schemas\":[]}", content, "owner"));
        }
    }
    @Test void rejectsPathsExtraFieldsDuplicateUrisAndInvalidUtf8WithoutFetchingAnything() {
        try (var content = new ContentStore()) {
            String id = stage(content, "owner", new byte[] { (byte) 0xc0, (byte) 0xaf });
            for (String uri : List.of("urn:test:bad-utf8", "relative.json", "https://test.fit-connect.fitko.dev/internal"))
                assertThrows(SessionException.class, () -> ReceiveRequest.resolve(document(uri, id), content, "owner"));
            for (String source : List.of("{\"schemas\":[],\"path\":\"C:/secret\"}", "{\"schemas\":[],\"schemas\":[]}",
                    "{\"schemas\":[{\"uri\":\"urn:test:s\",\"contentId\":\"C:/secret\"}]}",
                    "{\"schemas\":[{\"uri\":\"urn:test:s\",\"contentId\":\"" + id + "\"},{\"uri\":\"urn:test:s\",\"contentId\":\"" + id + "\"}]}"))
                assertThrows(SessionException.class, () -> ReceiveRequest.resolve(source, content, "owner"));
        }
    }
    @Test void boundsDocumentCountIndividualFileAndTotalBeforeAllocatingSchemaStrings() {
        try (var content = new ContentStore()) {
            String big = stage(content, "owner", new byte[2 * 1024 * 1024 + 1]);
            var failure = assertThrows(SessionException.class, () -> ReceiveRequest.resolve(document("urn:test:big", big), content, "owner"));
            assertEquals("content_limit", failure.code());
            String sized = stage(content, "owner", new byte[2 * 1024 * 1024]);
            var rows = new ArrayList<Map<String,String>>();
            for (int i = 0; i < 9; i++) rows.add(Map.of("uri", "urn:test:" + i, "contentId", sized));
            assertEquals("content_limit", assertThrows(SessionException.class, () -> ReceiveRequest.resolve(new com.google.gson.Gson().toJson(Map.of("schemas", rows)), content, "owner")).code());
            for (int i = 9; i < 33; i++) rows.add(Map.of("uri", "urn:test:" + i, "contentId", sized));
            assertThrows(SessionException.class, () -> ReceiveRequest.resolve(new com.google.gson.Gson().toJson(Map.of("schemas", rows)), content, "owner"));
        }
    }
}
