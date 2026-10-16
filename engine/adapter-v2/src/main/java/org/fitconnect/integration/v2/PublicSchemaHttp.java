package org.fitconnect.integration.v2;

import java.io.IOException;
import java.net.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Public HTTPS schema reads. Checked DNS answers are the addresses used by the socket. */
final class PublicSchemaHttp {
  private static final OkHttpClient HTTP=client(Dns.SYSTEM);
  private static final int MAX_REDIRECTS=5;

  static OkHttpClient client(Dns resolver) {
    return new OkHttpClient.Builder()
        .dns(host -> checkedAddresses(resolver.lookup(host)))
        .proxy(Proxy.NO_PROXY)
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(8,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS)
        .callTimeout(15,TimeUnit.SECONDS).build();
  }

  static String text(String value) {
    try {
      byte[] bytes=fetch(uri(value),2*1024*1024);
      return SchemaSafety.check(java.nio.charset.StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString());
    } catch(org.fitconnect.integration.contract.SessionException failure) { throw failure;
    } catch(javax.net.ssl.SSLException failure) { throw new org.fitconnect.integration.contract.SessionException("schema_tls_error");
    } catch(java.nio.charset.CharacterCodingException failure) { throw failed();
    } catch(IOException failure) { throw new org.fitconnect.integration.contract.SessionException("schema_network_error");
    } catch(Exception failure) { throw failed(); }
  }

  static byte[] archive(String value) {
    try { return fetch(uri(value),8*1024*1024);
    } catch(org.fitconnect.integration.contract.SessionException failure) { throw failure;
    } catch(javax.net.ssl.SSLException failure) { throw new org.fitconnect.integration.contract.SessionException("schema_tls_error");
    } catch(IOException failure) { throw new org.fitconnect.integration.contract.SessionException("schema_network_error");
    } catch(Exception failure) { throw failed(); }
  }

  static URI uri(String value) {
    if(value==null || value.length()>4096)throw blocked();
    URI uri;
    try { uri=URI.create(value); }
    catch(IllegalArgumentException invalid) { throw blocked(); }
    String host=uri.getHost();
    if(uri.getRawFragment()!=null || !"https".equalsIgnoreCase(uri.getScheme()) || host==null || host.isBlank() || uri.getRawUserInfo()!=null || uri.getPort()==0 || uri.getPort()>65535 || host.contains("%"))throw blocked();
    String normalized=host.toLowerCase(Locale.ROOT).replaceAll("\\.$","");
    if(normalized.equals("localhost") || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal"))throw blocked();
    // OkHttp can bypass DNS for literals. Validate these before creating a call as well.
    if(host.contains(":") || host.matches("[0-9.]+")) {
      try { checkedAddresses(List.of(InetAddress.getByName(host))); }
      catch(UnknownHostException invalid) { throw blocked(); }
    }
    return uri;
  }

  static List<InetAddress> checkedAddresses(List<InetAddress> addresses) {
    if(addresses.isEmpty() || addresses.stream().anyMatch(address -> !isPublic(address)))throw blocked();
    return List.copyOf(addresses);
  }

  static boolean isPublic(InetAddress address) {
    if(address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress())return false;
    byte[] raw=address.getAddress();int a=raw[0]&255,b=raw[1]&255;
    if(raw.length==4) {
      int c=raw[2]&255;
      return !(a==0 || a==10 || a==127 || a>=224 || a==100 && b>=64 && b<=127 ||
          a==168 && b==63 && c==129 && (raw[3]&255)==16 || a==169 && b==254 || a==172 && b>=16 && b<=31 ||
          a==192 && (b==168 || b==0 && (c==0 || c==2) || b==88 && c==99) ||
          a==198 && (b==18 || b==19 || b==51 && c==100) || a==203 && b==0 && c==113);
    }
    if(raw.length!=16 || (a&0xe0)!=0x20)return false;
    // Exclude special-purpose, documentation and transition prefixes from global IPv6.
    return !(a==0x20 && b==1 && (raw[2]&255)<2 ||
        a==0x20 && b==1 && (raw[2]&255)==0x0d && (raw[3]&255)==0xb8 ||
        a==0x20 && b==2 || a==0x3f && b==0xff && (raw[2]&0xf0)==0);
  }

  static byte[] fetch(URI start,int limit) throws IOException { return fetch(start,limit,HTTP); }

  static byte[] fetch(URI start,int limit,Call.Factory calls) throws IOException {
    URI current=uri(start.toString());Set<URI> visited=new HashSet<>();
    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
    for(int redirects=0;redirects<=MAX_REDIRECTS;redirects++) {
      current=uri(current.toString());
      if(!visited.add(current))throw failed();
      Request request=new Request.Builder().url(current.toString()).header("Accept","application/schema+json, application/json, application/xml, application/zip").build();
      Call call=calls.newCall(request);long remaining=deadline-System.nanoTime();
      if(remaining<=0)throw failed();call.timeout().timeout(remaining,TimeUnit.NANOSECONDS);
      try(Response response=call.execute()) {
        int code=response.code();
        if(Set.of(301,302,303,307,308).contains(code)) {
          String location=response.header("Location");
          if(location==null || redirects==MAX_REDIRECTS)throw failed();
          try { current=uri(current.resolve(location).toString()); }
          catch(IllegalArgumentException invalid) { throw blocked(); }
          continue;
        }
        if(code!=200)throw new org.fitconnect.integration.contract.SessionException("schema_http_error",code);
        if(response.body()==null)throw failed();
        try(var input=response.body().byteStream()) { byte[] bytes=input.readNBytes(limit+1); if(bytes.length>limit)throw failed(); return bytes; }
      }
    }
    throw failed();
  }

  private static org.fitconnect.integration.contract.SessionException blocked() { return failed(); }
  private static org.fitconnect.integration.contract.SessionException failed() { return new org.fitconnect.integration.contract.SessionException("schema_unavailable"); }
}
