package org.fitconnect.integration.contract;

import java.io.*;
import java.net.URI;
import java.nio.charset.*;
import java.util.*;
import java.util.function.Function;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.w3c.dom.*;
import org.w3c.dom.ls.*;

/** Operation-local, consent-bound schema resources. Never reads filesystem paths or writes ZIP entries. */
public final class SchemaSources {
    /** Transfers ownership of the returned byte arrays, which are cleared after decoding. */
    @FunctionalInterface public interface XmlArchiveLoader { Map<String,byte[]> load(String identifier); }
    public static final String CONSENT = "urn:fbforge:testclient:external-schema-consent";
    private static final String XSD = XMLConstants.W3C_XML_SCHEMA_NS_URI;
    private final Function<String,String> text;
    private final Function<String,byte[]> archive;
    private final XmlArchiveLoader sdkArchive;
    private final boolean allowed;
    private final Map<String,String> documents = new LinkedHashMap<>();
    private final Map<String,Map<String,String>> archives = new HashMap<>();
    private final long deadline = System.nanoTime() + 90_000_000_000L;
    private int requests;
    private long bytes;
    public SchemaSources(Map<String,String> local, boolean allowed, Function<String,String> text, Function<String,byte[]> archive) {
        this(local, allowed, text, archive, null);
    }
    public static SchemaSources withXmlArchiveLoader(Map<String,String> local, boolean allowed, Function<String,String> text, XmlArchiveLoader loader) {
        return new SchemaSources(local, allowed, text, null, Objects.requireNonNull(loader));
    }
    private SchemaSources(Map<String,String> local, boolean allowed, Function<String,String> text, Function<String,byte[]> archive, XmlArchiveLoader sdkArchive) {
        this.allowed = allowed; this.text = text; this.archive = archive;
        this.sdkArchive = sdkArchive;
        for (var item : local.entrySet()) if (!CONSENT.equals(item.getKey())) add(documentUri(item.getKey()), item.getValue());
    }
    public static String documentUri(String value) {
        try {
            URI uri = URI.create(value);
            if (!uri.isAbsolute() || value.length() > 4096) throw new IllegalArgumentException();
            String source = uri.toString(); int fragment = source.indexOf('#');
            return fragment < 0 ? source : source.substring(0, fragment);
        } catch (Exception failure) { throw unavailable(); }
    }
    public String document(String uri) {
        check(); String key = documentUri(uri);
        String existing = documents.get(key);
        if (existing != null) return existing;
        permission();
        URI remote = URI.create(key);
        // Historical schema identifiers may use HTTP. Retrieval still requires authenticated HTTPS.
        if ("http".equalsIgnoreCase(remote.getScheme())) remote = URI.create("https" + key.substring(key.indexOf(':')));
        if (!"https".equalsIgnoreCase(remote.getScheme()) || remote.getHost() == null || remote.getRawUserInfo() != null) throw unavailable();
        if (++requests > 32) throw new SessionException("content_limit");
        String loaded = text.apply(remote.toString()); check(); add(key, loaded); return loaded;
    }
    private void add(String uri, String source) {
        if (source == null || source.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024 || documents.size() >= 512)
            throw new SessionException("content_limit");
        if (documents.containsKey(uri)) {
            if (!documents.get(uri).equals(source)) throw unavailable();
            return;
        }
        bytes += source.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > 16 * 1024 * 1024) throw new SessionException("content_limit");
        documents.put(uri, source);
    }
    public Map<String,String> xmlFiles(String identifier) {
        var initial = initialXmlFiles(identifier);
        var result = new LinkedHashMap<String,String>();
        var pending = new ArrayDeque<>(initial.keySet());
        while (!pending.isEmpty()) {
            String uri = pending.removeFirst();
            if (result.containsKey(uri)) continue;
            String source = document(uri); result.put(uri, source);
            var root = xml(source);
            for (String kind : List.of("include", "import", "redefine")) {
                var refs = root.getElementsByTagNameNS(XSD, kind);
                for (int index = 0; index < refs.getLength(); index++) {
                    String location = ((Element) refs.item(index)).getAttribute("schemaLocation");
                    if (!location.isBlank()) pending.add(URI.create(uri).resolve(location).toString());
                }
            }
            if (pending.size() > 2048) throw new SessionException("content_limit");
        }
        return Map.copyOf(result);
    }
    private Map<String,String> initialXmlFiles(String identifier) {
        String id = documentUri(identifier);
        if (!id.startsWith("urn:xoev-de:")) return Map.of(id, document(id));
        var cached = archives.get(id); if (cached != null) return preferredXmlTree(cached);
        if (!id.matches("urn:xoev-de:[a-zA-Z0-9._:-]{1,512}")) throw unavailable();
        permission(); if (++requests > 32) throw new SessionException("content_limit");
        if (sdkArchive != null) {
            var loaded = sdkArchive.load(id);
            var files = new LinkedHashMap<String,String>();
            try {
                if (loaded == null || loaded.size() > 1024) throw unavailable();
                long expanded = 0;
                for (var item : loaded.entrySet()) {
                    check(); String name = item.getKey(); byte[] data = item.getValue();
                    if (name == null || name.startsWith("/") || name.contains("\\") || Arrays.asList(name.split("/")).contains("..") || name.contains(":")) throw unavailable();
                    if (data == null || data.length > 2 * 1024 * 1024 || (expanded += data.length) > 16 * 1024 * 1024) throw new SessionException("content_limit");
                    if (!name.toLowerCase(Locale.ROOT).endsWith(".xsd")) continue;
                    String uri = "https://www.xrepository.de/testclient-archive/" + id + "/" + name;
                    String source = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(data)).toString();
                    xml(source); add(uri, source); files.put(uri, source);
                }
            } catch (SessionException failure) { throw failure;
            } catch (Exception failure) { throw new SessionException("schema_archive_invalid");
            } finally { if (loaded != null) loaded.values().forEach(data -> { if (data != null) Arrays.fill(data, (byte) 0); }); }
            if (files.isEmpty()) throw new SessionException("schema_archive_invalid");
            archives.put(id, Map.copyOf(files)); return preferredXmlTree(archives.get(id));
        }
        byte[] zip = archive.apply("https://www.xrepository.de/api/version_standard/" + id + "/xmlschema");
        var files = new LinkedHashMap<String,String>();
        try (var input = new ZipInputStream(new ByteArrayInputStream(zip))) {
            java.util.zip.ZipEntry entry; int count = 0; long expanded = 0;
            while ((entry = input.getNextEntry()) != null) {
                check(); if (++count > 1024) throw new SessionException("content_limit");
                String name = entry.getName();
                if (name.startsWith("/") || name.contains("\\") || Arrays.asList(name.split("/")).contains("..") || name.contains(":")) throw unavailable();
                if (entry.isDirectory()) continue;
                byte[] data = input.readNBytes(2 * 1024 * 1024 + 1);
                if (data.length > 2 * 1024 * 1024 || (expanded += data.length) > 16 * 1024 * 1024) throw new SessionException("content_limit");
                if (!name.toLowerCase(Locale.ROOT).endsWith(".xsd")) continue;
                String base = "https://www.xrepository.de/testclient-archive/" + id + "/";
                String uri = base + name;
                if (files.containsKey(uri)) throw unavailable();
                String source = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(data)).toString();
                xml(source); add(uri, source); files.put(uri, source);
            }
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw unavailable();
        } finally { Arrays.fill(zip, (byte) 0); }
        if (files.isEmpty()) throw unavailable();
        archives.put(id, Map.copyOf(files)); return preferredXmlTree(archives.get(id));
    }
    private static Map<String,String> preferredXmlTree(Map<String,String> files) {
        // XRepository's development tree mirrors the standard with bundled, relative dependencies.
        if (files.keySet().stream().noneMatch(name -> name.contains("/xsd_dev/"))) return files;
        boolean completeMirror = files.keySet().stream().filter(name -> name.contains("/xsd/"))
                .allMatch(name -> files.containsKey(name.replace("/xsd/", "/xsd_dev/")));
        var selected = new LinkedHashMap<String,String>();
        files.forEach((name, source) -> { if (completeMirror == name.contains("/xsd_dev/")) selected.put(name, source); });
        return selected;
    }
    public boolean primaryXmlFile(String identifier, String name) {
        var files = archives.get(documentUri(identifier));
        if (files == null || files.keySet().stream().noneMatch(key -> key.contains("/xsd/"))) return true;
        return name.contains("/xsd/") || files.containsKey(name.replace("/xsd_dev/", "/xsd/"));
    }
    /** Snapshot only: these methods never authorize or perform an additional resource request. */
    public Map<String,String> cachedDocuments() { return Map.copyOf(documents); }
    public Map<String,String> cachedXmlFiles(String identifier) {
        String id = documentUri(identifier);
        var initial = archives.containsKey(id) ? preferredXmlTree(archives.get(id))
                : documents.containsKey(id) ? Map.of(id, documents.get(id)) : Map.<String,String>of();
        var result = new LinkedHashMap<String,String>();
        var pending = new ArrayDeque<>(initial.keySet());
        while (!pending.isEmpty()) {
            String uri = pending.removeFirst();
            if (result.containsKey(uri) || !documents.containsKey(uri)) continue;
            String source = documents.get(uri); result.put(uri, source);
            var root = xml(source);
            for (String kind : List.of("include", "import", "redefine")) {
                var refs = root.getElementsByTagNameNS(XSD, kind);
                for (int index = 0; index < refs.getLength(); index++) {
                    String location = ((Element) refs.item(index)).getAttribute("schemaLocation");
                    if (!location.isBlank()) pending.add(URI.create(uri).resolve(location).toString());
                }
            }
            if (pending.size() > 2048) throw new SessionException("content_limit");
        }
        return Map.copyOf(result);
    }
    /** Platform XSD validation with a closed resolver. Network I/O can occur only through document(). */
    public boolean validateXml(byte[] data, String identifier) {
        try {
            var instance = xml(new String(data, StandardCharsets.UTF_8));
            var files = xmlFiles(identifier);
            String root = null;
            var actual = instance.getDocumentElement();
            String location = actual.getAttributeNS(XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "schemaLocation");
            if (location.isBlank()) location = actual.getAttributeNS(XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "noNamespaceSchemaLocation");
            var candidates = new ArrayList<String>();
            for (var item : files.entrySet()) {
                var schema = xml(item.getValue()).getDocumentElement();
                if (!Objects.equals(Objects.toString(actual.getNamespaceURI(), ""), schema.getAttribute("targetNamespace"))) continue;
                for (Node child = schema.getFirstChild(); child != null; child = child.getNextSibling())
                    if (child instanceof Element element && XSD.equals(element.getNamespaceURI()) && "element".equals(element.getLocalName())
                            && actual.getLocalName().equals(element.getAttribute("name"))) { candidates.add(item.getKey()); break; }
            }
            if (candidates.size() == 1) root = candidates.getFirst();
            else for (String candidate : candidates) for (String offered : location.trim().split("\\s+"))
                if (candidate.equals(offered) || candidate.endsWith("/" + offered)) { if (root != null && !root.equals(candidate)) throw unavailable(); root = candidate; }
            if (root == null) throw unavailable();
            var factory = SchemaFactory.newInstance(XSD);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, ""); factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            LSResourceResolver resolver = (type, namespace, publicId, systemId, baseUri) -> {
                if (systemId == null || baseUri == null) throw unavailable();
                String resolved = URI.create(baseUri).resolve(systemId).toString();
                if (resolved.contains("/testclient-archive/") && !documents.containsKey(resolved)) throw unavailable();
                String source = document(resolved); xml(source);
                try {
                    var implementation = (DOMImplementationLS) actual.getOwnerDocument().getImplementation().getFeature("LS", "3.0");
                    LSInput input = implementation.createLSInput(); input.setSystemId(resolved); input.setBaseURI(resolved);
                    input.setPublicId(publicId); input.setCharacterStream(new StringReader(source)); return input;
                } catch (Exception failure) { throw unavailable(); }
            };
            factory.setResourceResolver(resolver);
            var source = new StreamSource(new StringReader(documents.get(root))); source.setSystemId(root);
            var validator = factory.newSchema(source).newValidator();
            validator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, ""); validator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            validator.setResourceResolver(resolver);
            validator.validate(new javax.xml.transform.dom.DOMSource(instance)); check(); return true;
        } catch (SessionException failure) { throw failure;
        } catch (org.xml.sax.SAXException failure) { return false;
        } catch (Exception failure) { throw unavailable(); }
    }
    private static Document xml(String source) {
        try {
            var factory = DocumentBuilderFactory.newInstance(); factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            return factory.newDocumentBuilder().parse(new org.xml.sax.InputSource(new StringReader(source)));
        } catch (Exception failure) { throw unavailable(); }
    }
    private void permission() { check(); if (!allowed) throw new SessionException("schema_consent_required"); }
    private void check() { if (System.nanoTime() > deadline) throw new SessionException("schema_unavailable"); }
    private static SessionException unavailable() { return new SessionException("schema_unavailable"); }
}
