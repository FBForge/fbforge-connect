// Test-only ICAP peer backed by the actual ClamAV process. No public listener or production relay.
import { createServer } from 'node:net';
import { once } from 'node:events';
export async function startIcapTestService(scan) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(20000, () => socket.destroy());
    let buffer = Buffer.alloc(0),
      responding = false;
    socket.on('data', async (chunk) => {
      if (responding) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 33 * 1024 * 1024) return socket.destroy();
      try {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) {
          if (buffer.length > 8192) socket.destroy();
          return;
        }
        const header = buffer.subarray(0, end).toString('ascii');
        const offset = /Encapsulated: res-hdr=0, res-body=(\d+)/i.exec(header);
        if (!header.startsWith('RESPMOD icap://127.0.0.1:') || !offset || Number(offset[1]) > 8192)
          throw new Error();
        const bodyStart = end + 4 + Number(offset[1]);
        if (buffer.length < bodyStart) return;
        const http = buffer.subarray(end + 4, bodyStart).toString('ascii');
        const length = Number(/Content-Length: (\d+)/i.exec(http)?.[1]);
        if (!http.startsWith('HTTP/1.1 200 OK') || !Number.isSafeInteger(length) || length > 32 * 1024 * 1024)
          throw new Error();
        let position = bodyStart,
          total = 0;
        const pieces = [];
        for (;;) {
          const line = buffer.indexOf('\r\n', position);
          if (line < 0) return;
          const hex = buffer.subarray(position, line).toString('ascii');
          if (!/^[0-9a-f]{1,8}$/i.test(hex)) throw new Error();
          const size = Number.parseInt(hex, 16);
          position = line + 2;
          if (size > 8192 || total + size > length) throw new Error();
          if (buffer.length < position + size + 2) return;
          if (buffer.subarray(position + size, position + size + 2).toString('ascii') !== '\r\n')
            throw new Error();
          if (size === 0) break;
          pieces.push(buffer.subarray(position, position + size));
          total += size;
          position += size + 2;
        }
        if (total !== length) throw new Error();
        responding = true;
        const result = await scan(Buffer.concat(pieces));
        if (result === 'stream: OK')
          socket.end('ICAP/1.0 204 No Content\r\nEncapsulated: null-body=0\r\n\r\n');
        else if (result.endsWith(' FOUND'))
          socket.end(
            'ICAP/1.0 200 OK\r\nX-Infection-Found: Type=0; Resolution=2; Threat=Scanner-Test-Finding;\r\nEncapsulated: null-body=0\r\n\r\n',
          );
        else socket.end('ICAP/1.0 500 Scanner Unavailable\r\nEncapsulated: null-body=0\r\n\r\n');
      } catch {
        socket.destroy();
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
