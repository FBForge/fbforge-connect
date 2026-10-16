package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import java.lang.reflect.Proxy;
import java.util.*;
import org.junit.jupiter.api.Test;

class SessionArchivesTest {
    private SessionKeyArchive item(String purpose) {
        return new SessionKeyArchive(new KeyReference(UUID.randomUUID().toString(), UUID.randomUUID().toString(), purpose), null, null, "{}", null, null);
    }
    @Test void onePrivateCheckpointUsesOneImmutableSnapshotEvenIfTheLiveKeyBankChangesBetweenFrames() {
        var original = new ArrayList<SessionKeyArchive>(List.of(item("decrypt"), item("sign")));
        var second = original.get(1);
        var session = (AuthenticatedSession) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{AuthenticatedSession.class}, (p,m,a) -> {
            assertEquals("archiveKeys", m.getName()); return List.copyOf(original);
        });
        var archive = new SessionArchives();
        assertEquals(2, archive.export(session, null, 0).total());
        original.clear(); original.add(item("decrypt"));
        assertSame(second, archive.export(session, null, 1).item());
        var end = archive.export(session, null, 2); assertNull(end.item()); assertEquals(2, end.total());
        assertThrows(SessionException.class, () -> archive.export(session, null, 1));
        assertEquals(1, archive.export(session, null, 0).total());
        archive.clear(); assertThrows(SessionException.class, () -> archive.export(session, null, 1));
    }
}
