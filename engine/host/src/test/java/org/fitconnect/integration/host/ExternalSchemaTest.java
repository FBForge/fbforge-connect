package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ExternalSchemaTest {
    private static final String ROOT = "https://example.invalid/root.json";
    private static final String CHILD = "https://example.invalid/person.json";

    @Test
    void bothInstalledValidatorsResolveRelativeReferencesThroughOnlyTheBoundedLoader()
            throws Exception {
        for (String version : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of(
                                                "../adapter-"
                                                        + version
                                                        + "/target/adapter-"
                                                        + version
                                                        + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                var calls = new ArrayList<String>();
                var documents =
                        Map.of(
                                ROOT,
                                "{\"$ref\":\"person.json\"}",
                                CHILD,
                                "{\"type\":\"object\",\"required\":[\"vorname\"],\"properties\":{\"vorname\":{\"const\":\"Erika\"}}}");
                var sources =
                        new SchemaSources(
                                Map.of(),
                                true,
                                uri -> {
                                    calls.add(uri);
                                    return Objects.requireNonNull(documents.get(uri));
                                },
                                uri -> {
                                    throw new AssertionError();
                                });
                var type =
                        loader.loadClass(
                                "org.fitconnect.integration." + version + ".SchemaValidation");
                var constructor = type.getDeclaredConstructor(SchemaSources.class);
                constructor.setAccessible(true);
                var validator = constructor.newInstance(sources);
                var validate = type.getDeclaredMethod("json", byte[].class, String.class);
                validate.setAccessible(true);
                assertEquals(
                        true,
                        validate.invoke(
                                validator,
                                "{\"vorname\":\"Erika\"}".getBytes(StandardCharsets.UTF_8),
                                ROOT));
                assertEquals(
                        false,
                        validate.invoke(
                                validator,
                                "{\"vorname\":\"Andere\"}".getBytes(StandardCharsets.UTF_8),
                                ROOT));
                assertEquals(List.of(ROOT, CHILD), calls);
                var snapshotMethod = type.getDeclaredMethod("snapshot", String.class);
                snapshotMethod.setAccessible(true);
                var snapshot = (SchemaSnapshot) snapshotMethod.invoke(validator, ROOT);
                var packet =
                        com.google.gson.JsonParser.parseString(snapshot.document())
                                .getAsJsonObject();
                assertEquals(Set.of(ROOT, CHILD), packet.getAsJsonObject("documents").keySet());
                assertEquals(List.of(ROOT, CHILD), calls, "Annotation snapshot must never fetch");
                assertNull(
                        ((SchemaSnapshot)
                                        snapshotMethod.invoke(
                                                validator, "https://example.invalid/unused.json"))
                                .document());
                assertEquals(List.of(ROOT, CHILD), calls);
            }
    }

    @Test
    void noConsentOrAFileReferenceCannotReachAnyFetcher() {
        var calls = new AtomicInteger();
        var sources =
                new SchemaSources(
                        Map.of(),
                        false,
                        uri -> {
                            calls.incrementAndGet();
                            return "{}";
                        },
                        uri -> {
                            throw new AssertionError();
                        });
        assertEquals(
                "schema_consent_required",
                assertThrows(SessionException.class, () -> sources.document(ROOT)).code());
        var allowed =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> {
                            calls.incrementAndGet();
                            return "{}";
                        },
                        uri -> {
                            throw new AssertionError();
                        });
        assertThrows(SessionException.class, () -> allowed.document("file:///not-readable"));
        assertEquals(0, calls.get());
    }

    @Test
    void xrepositoryArchiveIncludesValidateActualXmlAndRejectInvalidDataWithoutWritingFiles()
            throws Exception {
        String root =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:include schemaLocation='types/person.xsd'/><xs:element name='antrag' type='person'/></xs:schema>";
        String child =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:complexType name='person'><xs:sequence><xs:element name='vorname' type='xs:string'/></xs:sequence></xs:complexType></xs:schema>";
        byte[] archive = zip(Map.of("xsd/root.xsd", root, "xsd/types/person.xsd", child));
        var sources =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> {
                            throw new AssertionError(
                                    "Archive-relative includes must stay in memory");
                        },
                        uri -> {
                            assertEquals(
                                    "https://www.xrepository.de/api/version_standard/urn:xoev-de:test:standard:test_1.0/xmlschema",
                                    uri);
                            return archive.clone();
                        });
        assertTrue(
                sources.validateXml(
                        "<antrag><vorname>Erika</vorname></antrag>"
                                .getBytes(StandardCharsets.UTF_8),
                        "urn:xoev-de:test:standard:test_1.0"));
        assertFalse(
                sources.validateXml(
                        "<antrag><nachname>Erika</nachname></antrag>"
                                .getBytes(StandardCharsets.UTF_8),
                        "urn:xoev-de:test:standard:test_1.0"));
        assertEquals(2, sources.cachedXmlFiles("urn:xoev-de:test:standard:test_1.0").size());
        assertTrue(sources.cachedXmlFiles("urn:xoev-de:test:unloaded_1.0").isEmpty());
        var traversal =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> "",
                        uri -> {
                            try {
                                return zip(Map.of("../escape.xsd", root));
                            } catch (IOException failure) {
                                throw new UncheckedIOException(failure);
                            }
                        });
        assertThrows(
                SessionException.class,
                () -> traversal.xmlFiles("urn:xoev-de:test:standard:test_1.0"));
    }

    @Test
    void completeXrepositoryDevelopmentMirrorUsesBundledImportsAndIdentifiesPrimaryMessageSchemas()
            throws Exception {
        String identifier = "urn:xoev-de:test:standard:test_1.0";
        String production =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:include schemaLocation='http://example.invalid/types.xsd'/><xs:element name='antrag' type='person'/></xs:schema>";
        String development = production.replace("http://example.invalid/types.xsd", "types.xsd");
        String types =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:element name='hilfswert' type='xs:string'/><xs:complexType name='person'><xs:sequence><xs:element name='vorname' type='xs:string'/></xs:sequence></xs:complexType></xs:schema>";
        byte[] archive =
                zip(
                        Map.of(
                                "xsd/message.xsd",
                                production,
                                "xsd_dev/message.xsd",
                                development,
                                "xsd_dev/types.xsd",
                                types));
        var downloads = new AtomicInteger();
        var sources =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> {
                            throw new AssertionError(
                                    "Bundled schemas must not fetch dependencies: " + uri);
                        },
                        uri -> {
                            downloads.incrementAndGet();
                            return archive.clone();
                        });
        var files = sources.xmlFiles(identifier);
        assertEquals(2, files.size());
        assertTrue(files.keySet().stream().allMatch(name -> name.contains("/xsd_dev/")));
        assertTrue(
                sources.validateXml(
                        "<antrag><vorname>Erika</vorname></antrag>"
                                .getBytes(StandardCharsets.UTF_8),
                        identifier));
        assertFalse(
                sources.validateXml(
                        "<antrag><nachname>Erika</nachname></antrag>"
                                .getBytes(StandardCharsets.UTF_8),
                        identifier));
        for (String version : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of(
                                                "../adapter-"
                                                        + version
                                                        + "/target/adapter-"
                                                        + version
                                                        + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                var type =
                        loader.loadClass(
                                "org.fitconnect.integration." + version + ".SchemaValidation");
                var constructor = type.getDeclaredConstructor(SchemaSources.class);
                constructor.setAccessible(true);
                var method = type.getDeclaredMethod("examplePackage", String.class);
                method.setAccessible(true);
                var bundle =
                        com.google.gson.JsonParser.parseString(
                                        (String)
                                                method.invoke(
                                                        constructor.newInstance(sources),
                                                        identifier))
                                .getAsJsonObject();
                for (var row : bundle.getAsJsonArray("schemas")) {
                    var item = row.getAsJsonObject();
                    assertEquals(
                            item.get("name").getAsString().endsWith("/message.xsd"),
                            item.get("primary").getAsBoolean());
                }
            }
        assertEquals(1, downloads.get());
    }

    @Test
    void legacyHttpIdentifiersFetchOnlyHttpsWhileOtherSchemesAndCredentialsStayBlocked() {
        var urls = new ArrayList<String>();
        var sources =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> {
                            urls.add(uri);
                            return "{}";
                        },
                        uri -> {
                            throw new AssertionError();
                        });
        assertEquals("{}", sources.document("http://example.invalid/types.json"));
        assertEquals("{}", sources.document("http://example.invalid/types.json"));
        assertEquals(List.of("https://example.invalid/types.json"), urls);
        for (String uri :
                List.of(
                        "file:///not-readable",
                        "ftp://example.invalid/schema",
                        "http://user:pass@example.invalid/schema"))
            assertThrows(SessionException.class, () -> sources.document(uri));
        assertEquals(1, urls.size());
    }

    @Test
    void incompleteDevelopmentTreeDoesNotReplaceTheMainStandardAndExternalImportsUseHttps()
            throws Exception {
        String identifier = "urn:xoev-de:test:standard:test_1.0";
        String root =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:include schemaLocation='http://example.invalid/types.xsd'/><xs:element name='antrag' type='xs:string'/></xs:schema>";
        byte[] archive =
                zip(
                        Map.of(
                                "xsd/message.xsd",
                                root,
                                "xsd_dev/unrelated.xsd",
                                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'/>"));
        var calls = new ArrayList<String>();
        var sources =
                new SchemaSources(
                        Map.of(),
                        true,
                        uri -> {
                            calls.add(uri);
                            return "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'/>";
                        },
                        uri -> archive.clone());
        var files = sources.xmlFiles(identifier);
        assertTrue(files.keySet().stream().anyMatch(name -> name.endsWith("/xsd/message.xsd")));
        assertTrue(files.keySet().stream().noneMatch(name -> name.contains("/xsd_dev/")));
        assertEquals(List.of("https://example.invalid/types.xsd"), calls);
        assertTrue(
                sources.validateXml(
                        "<antrag>Erika</antrag>".getBytes(StandardCharsets.UTF_8), identifier));
        assertEquals(1, calls.size());
    }

    private static byte[] zip(Map<String, String> files) throws IOException {
        var output = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(output)) {
            for (var item : files.entrySet()) {
                zip.putNextEntry(new ZipEntry(item.getKey()));
                zip.write(item.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    @Test
    void actualSdkXoevLoaderProvidesTheSameBoundedCatalogUsedForExamplesAndXmlValidation()
            throws Exception {
        String identifier = "urn:xoev-de:bmk:standard:xbau_2.4.0.1";
        String root =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:include schemaLocation='types.xsd'/><xs:element name='antrag' type='person'/></xs:schema>";
        String types =
                "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:complexType name='person'><xs:sequence><xs:element name='vorname' type='xs:string'/></xs:sequence></xs:complexType></xs:schema>";
        byte[] archive = zip(Map.of("xsd/root.xsd", root, "xsd/types.xsd", types));
        try (var loader =
                new URLClassLoader(
                        new URL[] {Path.of("../adapter-v2/target/adapter-v2.jar").toUri().toURL()},
                        getClass().getClassLoader())) {
            var type = loader.loadClass("org.fitconnect.integration.v2.SdkXmlSchemas");
            var method =
                    type.getDeclaredMethod("load", String.class, java.util.function.Function.class);
            method.setAccessible(true);
            var calls = new AtomicInteger();
            java.util.function.Function<String, byte[]> download =
                    uri -> {
                        calls.incrementAndGet();
                        assertEquals(
                                "https://www.xrepository.de/api/version_standard/"
                                        + identifier
                                        + "/xmlschema",
                                uri);
                        return archive.clone();
                    };
            SchemaSources.XmlArchiveLoader sdk =
                    uri -> {
                        try {
                            var raw = (Map<?, ?>) method.invoke(null, uri, download);
                            var result = new LinkedHashMap<String, byte[]>();
                            raw.forEach((name, bytes) -> result.put((String) name, (byte[]) bytes));
                            return result;
                        } catch (ReflectiveOperationException failure) {
                            throw new AssertionError(failure);
                        }
                    };
            var denied =
                    SchemaSources.withXmlArchiveLoader(
                            Map.of(),
                            false,
                            uri -> {
                                throw new AssertionError();
                            },
                            sdk);
            assertEquals(
                    "schema_consent_required",
                    assertThrows(SessionException.class, () -> denied.xmlFiles(identifier)).code());
            assertEquals(0, calls.get());
            var sources =
                    SchemaSources.withXmlArchiveLoader(
                            Map.of(),
                            true,
                            uri -> {
                                throw new AssertionError();
                            },
                            sdk);
            assertEquals(2, sources.xmlFiles(identifier).size());
            assertTrue(
                    sources.validateXml(
                            "<antrag><vorname>Erika</vorname></antrag>"
                                    .getBytes(StandardCharsets.UTF_8),
                            identifier));
            assertFalse(
                    sources.validateXml(
                            "<antrag><nachname>Erika</nachname></antrag>"
                                    .getBytes(StandardCharsets.UTF_8),
                            identifier));
            assertEquals(1, calls.get());
        }
    }
}
