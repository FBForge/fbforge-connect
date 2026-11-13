package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

class DestinationReplyChannelsTest {
    @Test
    void documentedChannelsAllowOnlyTheirPublicConfiguration() {
        for (String source :
                new String[] {
                    "{\"eMail\":{\"usePgp\":true},\"deMail\":{},\"elster\":{},\"fink\":{},\"idBundDeMailbox\":{\"useStatusMonitor\":false}}",
                    "{\"fitConnect\":{\"processStandards\":[\"urn:test:reply\"]},\"eMail\":{}}"
                })
            assertDoesNotThrow(
                    () -> DestinationConfiguration.replyChannels(JsonParser.parseString(source)));
        for (String source :
                new String[] {
                    "{}",
                    "{\"unknown\":{}}",
                    "{\"eMail\":{\"secret\":\"no\"}}",
                    "{\"eMail\":{\"usePgp\":\"true\"}}",
                    "{\"idBundDeMailbox\":{}}",
                    "{\"deMail\":{\"url\":\"https://example.invalid\"}}",
                    "{\"fitConnect\":{\"processStandards\":[]}}"
                })
            assertThrows(
                    RuntimeException.class,
                    () -> DestinationConfiguration.replyChannels(JsonParser.parseString(source)));
    }
}
