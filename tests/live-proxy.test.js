import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { acceptanceProxy } from '../scripts/live-ui/proxy.mjs';
test('acceptance proxy refuses foreign targets and unauthenticated requests and never inspects tunneled data', async () => {
  const echo = createServer((socket) => socket.pipe(socket));
  echo.listen(0, '127.0.0.1');
  await once(echo, 'listening');
  const proxy = await acceptanceProxy(() => connect({ host: '127.0.0.1', port: echo.address().port }));
  const open = (host, authorization) =>
    new Promise((resolve, reject) => {
      const call = request({
        host: '127.0.0.1',
        port: proxy.port,
        method: 'CONNECT',
        path: host,
        headers: authorization ? { 'Proxy-Authorization': authorization } : {},
      });
      call.on('connect', (response, socket) => resolve({ response, socket }));
      call.on('error', reject);
      call.end();
    });
  try {
    const blocked = await open('untrusted.invalid:443');
    assert.equal(blocked.response.statusCode, 403);
    blocked.socket.destroy();
    const denied = await open('test.fit-connect.fitko.dev:443');
    assert.equal(denied.response.statusCode, 407);
    denied.socket.destroy();
    const allowed = await open(
      'test.fit-connect.fitko.dev:443',
      `Basic ${Buffer.from('synthetic-proxy-user:synthetic-proxy-password').toString('base64')}`,
    );
    assert.equal(allowed.response.statusCode, 200);
    allowed.socket.write('opaque TLS fixture');
    const [bytes] = await once(allowed.socket, 'data');
    assert.equal(bytes.toString(), 'opaque TLS fixture');
    allowed.socket.destroy();
    assert.equal(proxy.counts.get('test.fit-connect.fitko.dev'), 1);
  } finally {
    await proxy.close();
    await new Promise((resolve) => echo.close(resolve));
  }
});
