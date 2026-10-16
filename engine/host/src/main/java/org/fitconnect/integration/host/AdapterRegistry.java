package org.fitconnect.integration.host;

import java.io.IOException;
import java.net.URLClassLoader;
import java.nio.file.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

final class AdapterRegistry implements AutoCloseable {
    private record Loaded(URLClassLoader loader, SdkAdapter adapter) {}

    private final Map<ApiVersion, Path> jars;
    private final Map<ApiVersion, Loaded> loaded = new EnumMap<>(ApiVersion.class);

    AdapterRegistry(Path directory) {
        this(directory.resolve("adapter-v2.jar"), directory.resolve("adapter-v3.jar"));
    }

    AdapterRegistry(Path v2, Path v3) {
        jars = Map.of(ApiVersion.V2, v2, ApiVersion.V3, v3);
    }

    private Loaded load(ApiVersion version) throws ReflectiveOperationException, IOException {
        if (loaded.containsKey(version)) return loaded.get(version);
        Path path = jars.get(version).toRealPath();
        if (!Files.isRegularFile(path)) throw new IOException("Adapter unavailable");
        // Only JDK types and our tiny contract are shared. Host JSON/logging libraries cannot leak.
        ClassLoader bridge =
                new ClassLoader(ClassLoader.getPlatformClassLoader()) {
                    @Override
                    protected Class<?> loadClass(String name, boolean resolve)
                            throws ClassNotFoundException {
                        if (name.startsWith("org.fitconnect.integration.contract."))
                            return SdkAdapter.class.getClassLoader().loadClass(name);
                        return super.loadClass(name, resolve);
                    }
                };
        var loader = new URLClassLoader(new java.net.URL[] {path.toUri().toURL()}, bridge);
        try {
            String name =
                    version == ApiVersion.V2
                            ? "org.fitconnect.integration.v2.V2Adapter"
                            : "org.fitconnect.integration.v3.V3Adapter";
            var adapter =
                    (SdkAdapter) Class.forName(name, true, loader).getConstructor().newInstance();
            var result = new Loaded(loader, adapter);
            loaded.put(version, result);
            return result;
        } catch (ReflectiveOperationException | LinkageError | RuntimeException e) {
            loader.close();
            throw e;
        }
    }

    ProbeResult probe(ApiVersion version) throws ReflectiveOperationException, IOException {
        Loaded value = load(version);
        var thread = Thread.currentThread();
        ClassLoader previous = thread.getContextClassLoader();
        try {
            thread.setContextClassLoader(value.loader());
            ProbeResult result = value.adapter().probe();
            if (!result.isolated() || !version.wireValue().equals(result.apiVersion()))
                throw new IllegalStateException("Adapter isolation failed");
            return result;
        } finally {
            thread.setContextClassLoader(previous);
        }
    }

    Class<?> dependencyClass(ApiVersion version) throws ReflectiveOperationException, IOException {
        return load(version).adapter().dependencyClass();
    }

    AuthenticatedSession openSession(
            ApiVersion version, String clientId, String clientSecret, TokenExchange transport)
            throws ReflectiveOperationException, IOException {
        return openSession(
                version,
                clientId,
                clientSecret,
                transport,
                (endpoint, headers) -> {
                    throw new SessionException("endpoint_blocked");
                });
    }

    AuthenticatedSession openSession(
            ApiVersion version,
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources)
            throws ReflectiveOperationException, IOException {
        Loaded value = load(version);
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try {
            Thread.currentThread().setContextClassLoader(value.loader());
            return value.adapter().openSession(clientId, clientSecret, transport, resources);
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    <T> T withSession(
            ApiVersion version,
            AuthenticatedSession session,
            java.util.function.Function<AuthenticatedSession, T> operation) {
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try {
            Thread.currentThread().setContextClassLoader(load(version).loader());
            return operation.apply(session);
        } catch (SessionException e) {
            throw e;
        } catch (Exception | LinkageError e) {
            throw new SessionException("resource_unavailable");
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    void checkSession(ApiVersion version, AuthenticatedSession session)
            throws ReflectiveOperationException, IOException {
        Loaded value = load(version);
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try {
            Thread.currentThread().setContextClassLoader(value.loader());
            session.check();
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    public void close() {
        for (Loaded value : loaded.values()) {
            try {
                value.loader().close();
            } catch (IOException ignored) {
                /* No user paths in logs. */
            }
        }
        loaded.clear();
    }
}
