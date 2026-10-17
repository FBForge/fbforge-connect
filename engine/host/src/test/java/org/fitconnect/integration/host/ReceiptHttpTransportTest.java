package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptHttpTransportTest {
    private static final String CASE = "33333333-3333-4333-8333-333333333333";

    private static String url(ApiVersion api) {
        return "https://test.fit-connect.fitko.dev/submission-api/"
                + api.wireValue()
                + "/cases/"
                + CASE
                + "/events";
    }

    @Test
    void onlyTheExactTestCaseEventPostIsAllowedAndExistingProfilesStayReadOrSendOnly() {
        try (var transport = new TestResourceTransport()) {
            for (var api : ApiVersion.values()) {
                String endpoint = url(api);
                assertEquals(
                        endpoint,
                        SendHttpTransport.allowedReceipt(api, "POST", endpoint).toString());
                for (String method : List.of("GET", "PUT", "DELETE", "PATCH", "post"))
                    assertThrows(
                            SessionException.class,
                            () -> SendHttpTransport.allowedReceipt(api, method, endpoint));
                for (String value :
                        List.of(
                                endpoint.replace("https:", "http:"),
                                endpoint.replace(
                                        "test.fit-connect.fitko.dev", "prod.fit-connect.fitko.net"),
                                endpoint.replace(
                                        "test.fit-connect.fitko.dev",
                                        "test.fit-connect.fitko.dev:443"),
                                endpoint.replace(
                                        "test.fit-connect.fitko.dev",
                                        "user@test.fit-connect.fitko.dev"),
                                endpoint.replace(
                                        "/" + api.wireValue() + "/",
                                        api == ApiVersion.V2 ? "/v3/" : "/v2/"),
                                endpoint + "?",
                                endpoint + "?foo=1",
                                endpoint + "#x",
                                endpoint + "/",
                                endpoint.replace("/cases/", "/%63ases/"),
                                endpoint.replace("/events", "/../events"),
                                endpoint.replace(CASE, "not-a-uuid")))
                    assertThrows(
                            SessionException.class,
                            () -> SendHttpTransport.allowedReceipt(api, "POST", value),
                            value);
                assertThrows(
                        SessionException.class,
                        () -> SendHttpTransport.allowed(api, "POST", endpoint));
                assertThrows(
                        SessionException.class, () -> TestResourceTransport.allowed(api, endpoint));
                assertThrows(
                        SessionException.class,
                        () -> transport.forReceipt(api).get(endpoint, Map.of()));
                assertThrows(
                        SessionException.class,
                        () -> transport.forReceipt(api).request("PUT", endpoint, Map.of(), ""));
            }
        }
    }

    @Test
    void actualRequestPreservesTokenAndEmptyAcknowledgementWhileErrorsCloseTheBody() {
        for (var api : ApiVersion.values())
            for (int status : List.of(200, 201, 204, 302, 401, 403, 404, 500)) {
                var client = new StubHttp(status, new byte[0]);
                try (var transport = new SendHttpTransport(client)) {
                    var headers =
                            Map.of(
                                    "Authorization",
                                    "Bearer synthetic",
                                    "Content-Type",
                                    "application/jose");
                    if (status < 300)
                        assertEquals(
                                status,
                                transport
                                        .requestReceipt(
                                                api, "POST", url(api), headers, "e30.e30.AA")
                                        .status());
                    else {
                        var failure =
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                transport.requestReceipt(
                                                        api,
                                                        "POST",
                                                        url(api),
                                                        headers,
                                                        "e30.e30.AA"));
                        assertEquals(status, failure.httpStatus());
                        assertFalse(failure.getMessage().contains("synthetic"));
                    }
                    assertEquals(1, client.calls);
                    assertTrue(client.closed);
                    assertEquals(url(api), client.request.uri().toString());
                    assertEquals("POST", client.request.method());
                    assertEquals(
                            Optional.of("application/jose"),
                            client.request.headers().firstValue("Content-Type"));
                    assertEquals(
                            Optional.of("Bearer synthetic"),
                            client.request.headers().firstValue("Authorization"));
                    assertEquals(Optional.of(Duration.ofSeconds(60)), client.request.timeout());
                    assertEquals(10, client.request.bodyPublisher().orElseThrow().contentLength());
                    var data = new ByteArrayOutputStream();
                    var finished = new CompletableFuture<Void>();
                    client.request
                            .bodyPublisher()
                            .orElseThrow()
                            .subscribe(
                                    new Flow.Subscriber<java.nio.ByteBuffer>() {
                                        public void onSubscribe(Flow.Subscription subscription) {
                                            subscription.request(Long.MAX_VALUE);
                                        }

                                        public void onNext(java.nio.ByteBuffer buffer) {
                                            byte[] chunk = new byte[buffer.remaining()];
                                            buffer.get(chunk);
                                            data.writeBytes(chunk);
                                        }

                                        public void onError(Throwable failure) {
                                            finished.completeExceptionally(failure);
                                        }

                                        public void onComplete() {
                                            finished.complete(null);
                                        }
                                    });
                    finished.orTimeout(2, TimeUnit.SECONDS).join();
                    assertEquals(
                            "e30.e30.AA", data.toString(java.nio.charset.StandardCharsets.UTF_8));
                }
            }
        var client = new StubHttp(204, new byte[] {1});
        try (var transport = new SendHttpTransport(client)) {
            var failure =
                    assertThrows(
                            SessionException.class,
                            () ->
                                    transport.requestReceipt(
                                            ApiVersion.V2,
                                            "POST",
                                            url(ApiVersion.V2),
                                            Map.of(
                                                    "Authorization",
                                                    "Bearer synthetic",
                                                    "Content-Type",
                                                    "application/jose"),
                                            "e30.e30.AA"));
            assertEquals("invalid_resource", failure.code());
            assertEquals(204, failure.httpStatus());
            assertTrue(client.closed);
        }
    }

    @Test
    void malformedHeadersAndNonJwtBodiesNeverReachHttp() {
        var client = new StubHttp(204, new byte[0]);
        try (var transport = new SendHttpTransport(client)) {
            var valid =
                    Map.of("Authorization", "Bearer synthetic", "Content-Type", "application/jose");
            for (String body : List.of("{}", "\"e30.e30.AA\"", "x".repeat(65537)))
                assertThrows(
                        SessionException.class,
                        () ->
                                transport.requestReceipt(
                                        ApiVersion.V3, "POST", url(ApiVersion.V3), valid, body));
            for (var headers :
                    List.of(
                            Map.<String, String>of(),
                            Map.of(
                                    "Authorization",
                                    "Basic synthetic",
                                    "Content-Type",
                                    "application/jose"),
                            Map.of(
                                    "Authorization",
                                    "Bearer synthetic",
                                    "Content-Type",
                                    "application/json"),
                            Map.of(
                                    "Authorization",
                                    "Bearer synthetic\r\nInjected: x",
                                    "Content-Type",
                                    "application/jose"),
                            Map.of(
                                    "Authorization",
                                    "Bearer synthetic",
                                    "authorization",
                                    "Bearer duplicate",
                                    "Content-Type",
                                    "application/jose")))
                assertThrows(
                        SessionException.class,
                        () ->
                                transport.requestReceipt(
                                        ApiVersion.V3,
                                        "POST",
                                        url(ApiVersion.V3),
                                        headers,
                                        "e30.e30.AA"));
            assertEquals(0, client.calls);
        }
    }

    @Test
    void httpErrorsExposeOnlyTheOfficialProblemSlugAndNeverRawErrorDetails() {
        String official =
                "https://schema.fitko.de/fit-connect/submission-api/problems/request-invalid";
        for (String type :
                List.of(official, "https://untrusted.invalid/error", "raw-sensitive-text")) {
            byte[] body =
                    ("{\"type\":\"" + type + "\",\"detail\":\"synthetic-sensitive-detail\"}")
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
            var client = new StubHttp(400, body);
            try (var transport = new SendHttpTransport(client)) {
                var failure =
                        assertThrows(
                                SessionException.class,
                                () ->
                                        transport.requestReceipt(
                                                ApiVersion.V2,
                                                "POST",
                                                url(ApiVersion.V2),
                                                Map.of(
                                                        "Authorization",
                                                        "Bearer synthetic",
                                                        "Content-Type",
                                                        "application/jose"),
                                                "e30.e30.AA"));
                assertEquals(400, failure.httpStatus());
                assertEquals("resource_unavailable", failure.code());
                assertEquals(
                        type.equals(official) ? "request-invalid" : null, failure.problemType());
                assertFalse(failure.getMessage().contains("sensitive"));
                assertTrue(client.closed);
            }
        }
    }

    private static final class StubHttp extends HttpClient {
        final int status;
        final byte[] bytes;
        int calls;
        boolean closed;
        HttpRequest request;

        StubHttp(int status, byte[] bytes) {
            this.status = status;
            this.bytes = bytes;
        }

        @Override
        public <T> HttpResponse<T> send(HttpRequest value, HttpResponse.BodyHandler<T> handler) {
            request = value;
            calls++;
            var stream =
                    new ByteArrayInputStream(bytes) {
                        @Override
                        public void close() throws IOException {
                            closed = true;
                            super.close();
                        }
                    };
            return new HttpResponse<>() {
                public int statusCode() {
                    return status;
                }

                public HttpRequest request() {
                    return value;
                }

                public Optional<HttpResponse<T>> previousResponse() {
                    return Optional.empty();
                }

                public HttpHeaders headers() {
                    return HttpHeaders.of(Map.of(), (k, v) -> true);
                }

                @SuppressWarnings("unchecked")
                public T body() {
                    return (T) stream;
                }

                public Optional<SSLSession> sslSession() {
                    return Optional.empty();
                }

                public URI uri() {
                    return value.uri();
                }

                public HttpClient.Version version() {
                    return HttpClient.Version.HTTP_1_1;
                }
            };
        }

        public Optional<CookieHandler> cookieHandler() {
            return Optional.empty();
        }

        public Optional<Duration> connectTimeout() {
            return Optional.of(Duration.ofSeconds(5));
        }

        public Redirect followRedirects() {
            return Redirect.NEVER;
        }

        public Optional<ProxySelector> proxy() {
            return Optional.empty();
        }

        public SSLContext sslContext() {
            throw new UnsupportedOperationException();
        }

        public SSLParameters sslParameters() {
            throw new UnsupportedOperationException();
        }

        public Optional<Authenticator> authenticator() {
            return Optional.empty();
        }

        public Version version() {
            return Version.HTTP_1_1;
        }

        public Optional<Executor> executor() {
            return Optional.empty();
        }

        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest r, HttpResponse.BodyHandler<T> h) {
            throw new AssertionError();
        }

        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest r,
                HttpResponse.BodyHandler<T> h,
                HttpResponse.PushPromiseHandler<T> p) {
            throw new AssertionError();
        }
    }
}
