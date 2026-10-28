package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.client.services.auth.OAuthProvider;
import dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders;
import dev.fitko.fitconnect.rest.client.services.destination.impl.DestinationApiClient;
import dev.fitko.fitconnect.rest.client.services.submission.impl.SubmissionApiClient;
import java.util.UUID;
import org.fitconnect.integration.contract.*;

/** SDK v3 destination transport and model conversion. */
final class DestinationOperations {
    private final OAuthProvider current;
    private final OAuthTransport http;

    DestinationOperations(OAuthProvider current, OAuthTransport http) {
        this.current = current;
        this.http = http;
    }

    private DestinationApiClient destinationsApi() {
        return new DestinationApiClient(
                new RequestHeaders(current),
                http,
                IntegrationEnvironment.current().destinationApi());
    }

    public String destinations(int offset, int limit) {
        return http.json(destinationsApi().listDestinations(offset, limit));
    }

    public String destination(String destinationId) {
        return http.json(
                new SubmissionApiClient(
                                RequestHeaders.withoutCredentials(),
                                http,
                                new ConcurrencyLimiter(1),
                                IntegrationEnvironment.current().submissionApi())
                        .getDestination(UUID.fromString(destinationId)));
    }

    public String ownDestination(String destinationId) {
        return http.json(destinationsApi().getDestination(UUID.fromString(destinationId)));
    }

    public String processDestinations(
            String model,
            String message,
            String region,
            int offset,
            int limit,
            ResourceExchange processReads) {
        var transport =
                new OAuthTransport(
                        (url, body) -> {
                            throw new SessionException("endpoint_blocked");
                        },
                        processReads);
        var client =
                new SubmissionApiClient(
                        // TEST currently requires OAuth even though discovery is public by
                        // spec.
                        new RequestHeaders(current),
                        transport,
                        new ConcurrencyLimiter(1),
                        IntegrationEnvironment.current().submissionApi());
        return transport.json(
                client.searchDestinationsByProcessMessage(model, message, region, offset, limit));
    }

    public String canonicalDestinationMutation(String kind, String document) {
        try {
            var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
            Class<?> type =
                    switch (kind) {
                        case "create" ->
                                dev.fitko.fitconnect.rest.model.destination.CreateDestination.class;
                        case "patch" ->
                                dev.fitko.fitconnect.rest.model.destination.DestinationPatch.class;
                        case "key" -> dev.fitko.fitconnect.rest.model.jwk.ApiJwk.class;
                        default -> throw new SessionException("invalid_input");
                    };
            return mapper.writeValueAsString(mapper.readValue(document, type));
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_input");
        }
    }

    public String createOwnDestination(String document, ResourceExchange authorized) {
        try {
            var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
            var value =
                    mapper.readValue(
                            document,
                            dev.fitko.fitconnect.rest.model.destination.CreateDestination.class);
            var client =
                    new DestinationApiClient(
                            new RequestHeaders(current),
                            new DestinationWriteTransport(authorized),
                            IntegrationEnvironment.current().destinationApi());
            return http.json(client.createDestination(value));
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_resource");
        }
    }

    public void deleteOwnDestination(String destinationId, ResourceExchange authorized) {
        var client =
                new DestinationApiClient(
                        new RequestHeaders(current),
                        new DestinationWriteTransport(authorized),
                        IntegrationEnvironment.current().destinationApi());
        client.deleteDestination(UUID.fromString(destinationId));
    }

    public void registerOwnDestinationKey(
            String destinationId, String publicJwk, ResourceExchange authorized) {
        try {
            var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
            var key = mapper.readValue(publicJwk, dev.fitko.fitconnect.rest.model.jwk.ApiJwk.class);
            var client =
                    new DestinationApiClient(
                            new RequestHeaders(current),
                            new DestinationWriteTransport(authorized),
                            IntegrationEnvironment.current().destinationApi());
            client.addKey(UUID.fromString(destinationId), key);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_resource");
        }
    }

    public String patchOwnDestination(
            String destinationId, String patch, ResourceExchange authorized) {
        try {
            var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
            var value =
                    mapper.readValue(
                            patch,
                            dev.fitko.fitconnect.rest.model.destination.DestinationPatch.class);
            var client =
                    new DestinationApiClient(
                            new RequestHeaders(current),
                            new DestinationWriteTransport(authorized),
                            IntegrationEnvironment.current().destinationApi());
            return http.json(client.patchDestination(UUID.fromString(destinationId), value));
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("resource_unavailable");
        }
    }

    public String ownDestinationKeys(String id, int offset, int limit) {
        if (offset < 0 || offset > 10000 || limit < 1 || limit > 100)
            throw new SessionException("invalid_input");
        String endpoint =
                IntegrationEnvironment.current().destinationApi()
                        + "/v3/destinations/"
                        + UUID.fromString(id)
                        + "/keys?offset="
                        + offset
                        + "&limit="
                        + limit;
        return http.json(
                http.get(
                                endpoint,
                                new RequestHeaders(current).bodyless(),
                                dev.fitko.fitconnect.rest.model.jwk.ApiJwks.class)
                        .body());
    }

    public String destinationKeys(String destinationId, int offset, int limit) {
        return http.json(destinationsApi().listKeys(UUID.fromString(destinationId), offset, limit));
    }
}
