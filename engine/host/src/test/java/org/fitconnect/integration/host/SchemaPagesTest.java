package org.fitconnect.integration.host;
import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
class SchemaPagesTest {
 @Test void snapshotPagesPreserveUtf8AndAreDisposed() {
  String uri="https://example.invalid/schema", text="ä".repeat(20000);
  var pages=new SchemaPages(new SchemaSnapshot(uri,text));
  var bytes=new java.io.ByteArrayOutputStream();
  for(int offset=0;offset<text.getBytes(StandardCharsets.UTF_8).length;) {
   var page=pages.read("proof",offset);assertEquals(uri,page.schemaUri());assertEquals("proof",page.proofId());
   var chunk=Base64.getDecoder().decode(page.chunk());assertTrue(chunk.length<=12288);bytes.writeBytes(chunk);offset+=chunk.length;
  }
  assertEquals(text,bytes.toString(StandardCharsets.UTF_8));
  assertThrows(SessionException.class,()->pages.read("proof",-1));
  assertThrows(SessionException.class,()->pages.read("proof",40001));
  pages.close();assertThrows(SessionException.class,()->pages.read("proof",0));
 }
 @Test void absentSchemaStillHasAnExplicitEmptyPage() {
  assertEquals(0,new SchemaPages(null).read("proof",0).totalBytes());
  var page=new SchemaPages(new SchemaSnapshot("urn:test:schema",null)).read("proof",0);
  assertEquals("urn:test:schema",page.schemaUri());assertEquals("",page.chunk());
 }
}
