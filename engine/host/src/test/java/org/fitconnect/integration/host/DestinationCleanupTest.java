package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class DestinationCleanupTest {
    static class Remote extends DestinationManagementTest.Remote {
        int deletes;
        boolean lost;
        @Override public Response request(String method,String url,Map<String,String> headers,String body) {
            if (!method.equals("DELETE")) return super.request(method,url,headers,body);
            assertNull(body); assertTrue(headers.entrySet().stream().anyMatch(h->h.getKey().equalsIgnoreCase("authorization")));
            deletes++; assertNotNull(documents.remove(DestinationManagementTest.A));
            if(lost)throw new SessionException("resource_unavailable");
            return new Response(204,"");
        }
    }
    @Test void onlyExplicitlyConfirmedOwnedNeverActivatedDraftCanBeDeleted() throws Exception {
        var remote=new Remote();String id=DestinationManagementTest.A;
        try(var adapters=DestinationManagementTest.registry();var session=DestinationManagementTest.session(adapters,ApiVersion.V3,remote)) {
            var cleanup=new DestinationCleanup(remote);
            assertThrows(SessionException.class,()->cleanup.prepare(session,id)); assertEquals(0,remote.deletes);
            remote.documents.get(id).addProperty("status","created");
            var preview=cleanup.prepare(session,id); assertEquals(0,remote.deletes); cleanup.cancel(preview.attemptId());
            assertThrows(SessionException.class,()->cleanup.execute(session,preview.attemptId()));
            var confirmed=cleanup.prepare(session,id);
            assertEquals("removed",adapters.withSession(ApiVersion.V3,session,s->cleanup.execute(s,confirmed.attemptId())).status());
            assertEquals(1,remote.deletes); assertThrows(SessionException.class,()->cleanup.execute(session,confirmed.attemptId()));
        }
    }
    @Test void activationBetweenPreviewAndConfirmationPreventsDeletion() throws Exception {
        var remote=new Remote();String id=DestinationManagementTest.A;remote.documents.get(id).addProperty("status","draft");
        try(var adapters=DestinationManagementTest.registry();var session=DestinationManagementTest.session(adapters,ApiVersion.V3,remote)) {
            var cleanup=new DestinationCleanup(remote);var preview=cleanup.prepare(session,id);remote.documents.get(id).addProperty("status","active");
            assertEquals("conflict",cleanup.execute(session,preview.attemptId()).status());assertEquals(0,remote.deletes);
        }
    }
    @Test void lostDeleteResponseRemainsUncertainAndCannotBeRepeated() throws Exception {
        var remote=new Remote();String id=DestinationManagementTest.A;remote.documents.get(id).addProperty("status","created");remote.lost=true;
        try(var adapters=DestinationManagementTest.registry();var session=DestinationManagementTest.session(adapters,ApiVersion.V3,remote)) {
            var cleanup=new DestinationCleanup(remote);var preview=cleanup.prepare(session,id);
            assertEquals("uncertain",adapters.withSession(ApiVersion.V3,session,s->cleanup.execute(s,preview.attemptId())).status());
            assertThrows(SessionException.class,()->cleanup.prepare(session,id));assertEquals(1,remote.deletes);
        }
    }
}
