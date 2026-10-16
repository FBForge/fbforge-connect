package org.fitconnect.integration.host;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;

/** Four-byte unsigned big-endian length followed by strict UTF-8 JSON. */
final class FrameCodec {
    static final int MAX_BYTES = 65536;

    static String read(InputStream input) throws IOException {
        int first = input.read();
        if (first == -1) return null;
        byte[] rest = input.readNBytes(3);
        if (rest.length != 3) throw new EOFException("Truncated frame");
        long length =
                ((long) first << 24)
                        | ((rest[0] & 255L) << 16)
                        | ((rest[1] & 255L) << 8)
                        | (rest[2] & 255L);
        if (length < 1 || length > MAX_BYTES) throw new IOException("Invalid frame size");
        byte[] body = input.readNBytes((int) length);
        if (body.length != length) throw new EOFException("Truncated frame");
        try {
            return StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(body))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new IOException("Invalid encoding");
        }
    }

    static void write(OutputStream output, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 1 || bytes.length > MAX_BYTES)
            throw new IOException("Invalid frame size");
        new DataOutputStream(output).writeInt(bytes.length);
        output.write(bytes);
        output.flush();
    }
}
