package org.fitconnect.integration.contract;

import java.util.List;

/** Native-only candidates from a complete bounded page sequence. They still require SDK verification. */
public interface EventLogSource extends ResourceExchange {
    List<String> completeEventTokens();
}
