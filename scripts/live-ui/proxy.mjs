// Internal acceptance only. CONNECT tunnels remain encrypted and their payloads are never inspected.
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { navigate } from './exchange.mjs';
import { check } from './desktop.mjs';
const username = 'synthetic-proxy-user',
  password = 'synthetic-proxy-password';
const hosts = new Set([
  'test.fit-connect.fitko.dev',
  'auth-testing.fit-connect.fitko.dev',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'fimportal.de',
  'schema.fitko.de',
  'database.clamav.net',
  'cdn.clamav.net',
]);
export async function acceptanceProxy(dial = (host) => connect({ host, port: 443 })) {
  const sockets = new Set(),
    counts = new Map();
  const server = createServer((_, response) => {
    response.writeHead(405);
    response.end();
  });
  server.on('connect', (request, socket, head) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const match = /^([a-z0-9.-]+):443$/.exec(request.url || '');
    if (!match || !hosts.has(match[1])) {
      socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    if (
      request.headers['proxy-authorization'] !==
      `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    ) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="FBForge-TEST"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    const remote = dial(match[1]);
    sockets.add(remote);
    remote.on('close', () => sockets.delete(remote));
    remote.on('error', () => socket.destroy());
    socket.on('error', () => remote.destroy());
    socket.on('close', () => remote.destroy());
    remote.on('close', () => socket.destroy());
    remote.once('connect', () => {
      counts.set(match[1], (counts.get(match[1]) || 0) + 1);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      socket.pipe(remote);
      remote.pipe(socket);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    counts,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
export async function configureAcceptanceProxy(page, proxy) {
  await navigate(page, 'Info');
  await page.getByLabel('Verbindung', { exact: true }).selectOption('manual');
  await page.getByLabel('Proxy-Host', { exact: true }).fill('127.0.0.1');
  await page.getByLabel('Port', { exact: true }).fill(String(proxy.port));
  await page.getByLabel('Benutzername (optional)', { exact: true }).fill(username);
  await page.getByLabel('Passwort (optional)', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Netzwerkeinstellungen übernehmen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Verbindung neu einrichten?', exact: true })
    .getByRole('button', { name: 'Übernehmen und trennen', exact: true })
    .click();
  await page
    .getByText('Netzwerkeinstellungen gespeichert. Verbinden Sie Ihr Profil erneut.', { exact: true })
    .waitFor();
}
export function verifyAcceptanceProxy(proxy) {
  for (const host of ['auth-testing.fit-connect.fitko.dev', 'test.fit-connect.fitko.dev'])
    check(proxy.counts.get(host) > 0, 'live_ui_proxy_not_used');
  console.log(
    'Real desktop UI: OAuth and FIT-Connect used the configured authenticated CONNECT proxy with unchanged TLS verification',
  );
}
