// Opt-in TEST checks. No submission, reply, receipt, destination or key registration is written.
// Secrets are supplied only by the workflow step and never copied into a child process environment.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const secretNames = ['SENDERID', 'SENDERSECRET', 'SENDERDEST', 'SUBSCRIBERID', 'SUBSCRIBERSECRET'];
for (const name of secretNames) {
  if (!process.env[name]) throw new Error(`Missing Actions secret: ${name}`);
}
class NativeEngine {
  constructor() {
    const directory = fileURLToPath(new URL('../desktop/resources/engine/', import.meta.url));
    const java = `${directory}/runtime/bin/java${process.platform === 'win32' ? '.exe' : ''}`;
    const env = { ...process.env };
    for (const key of [...secretNames, 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH'])
      delete env[key];
    this.child = spawn(java, ['-jar', `${directory}/engine-host.jar`], {
      cwd: directory,
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.buffer = Buffer.alloc(0);
    this.child.stdout.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length < 4) return;
      const length = this.buffer.readUInt32BE();
      if (length < 1 || length > 65536) return this.fail('engine_protocol_error');
      if (this.buffer.length < 4 + length) return;
      const frame = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        const result = JSON.parse(frame);
        if (!this.pending || result.id !== this.pending.id) return this.fail('engine_protocol_error');
        const pending = this.pending;
        this.pending = null;
        clearTimeout(pending.timer);
        if (result.ok) pending.resolve(result.result);
        else
          pending.reject(
            new Error(
              `${pending.command}: ${/^[a-z_]+$/.test(result.error) ? result.error : 'engine_protocol_error'}`,
            ),
          );
      } catch {
        this.fail('engine_protocol_error');
      }
    });
    this.child.on('error', () => this.fail('engine_unavailable'));
    this.child.on('exit', () => this.fail('engine_closed'));
    this.child.stdin.on('error', () => this.fail('engine_closed'));
  }
  fail(code) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(code));
      this.pending = null;
    }
    this.child.kill();
  }
  call(apiVersion, command, values = {}) {
    assert.equal(this.pending, null);
    const id = randomUUID();
    const body = Buffer.from(JSON.stringify({ protocolVersion: 1, id, apiVersion, command, ...values }));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    return new Promise((resolve, reject) => {
      this.pending = {
        id,
        command,
        resolve,
        reject,
        timer: setTimeout(() => this.fail('engine_timeout'), 90000),
      };
      this.child.stdin.write(Buffer.concat([header, body]));
      body.fill(0);
    });
  }
  close() {
    this.child.stdin.end();
    this.child.kill();
  }
  pending = null;
}

let failures = 0;
for (const version of ['v2', 'v3']) {
  for (const [label, role, idName, secretName] of [
    ['sender', 'online-service', 'SENDERID', 'SENDERSECRET'],
    ['subscriber', 'administrative-system', 'SUBSCRIBERID', 'SUBSCRIBERSECRET'],
  ]) {
    const engine = new NativeEngine();
    try {
      const session = await engine.call(version, 'open_session', {
        role,
        clientId: process.env[idName],
        clientSecret: process.env[secretName],
      });
      assert.equal(session.environment, 'TEST');
      assert.equal(session.connected, true);
      const args = { sessionId: session.sessionId };
      if (label === 'sender') {
        const result = await engine.call(version, 'load_send_destination', {
          ...args,
          destinationId: process.env.SENDERDEST,
        });
        assert.equal(result.data.destinationId, process.env.SENDERDEST);
      } else {
        const result = await engine.call(version, 'list_destinations', { ...args, offset: 0 });
        assert.ok(Array.isArray(result.data.destinations));
        if (version === 'v3') {
          const generated = (await engine.call(version, 'generate_test_keys', args)).data;
          assert.equal(generated.status, 'ready');
          assert.equal(generated.encryption.purpose, 'decrypt');
          assert.equal(generated.signing.purpose, 'sign');
          assert.notEqual(generated.encryption.kid, generated.signing.kid);
        }
      }
      await engine.call(version, 'close_session', args);
      console.log(`${version} ${label}: TEST authentication and native read/local-key checks passed`);
    } catch (error) {
      failures++;
      // Never include SDK exceptions, network bodies, request values or tokens in CI output.
      const code =
        /^(open_session|load_send_destination|list_destinations|generate_test_keys): [a-z_]+$/.test(
          error.message,
        )
          ? error.message
          : 'live_check_failed';
      console.error(`${version} ${label}: ${code}`);
    } finally {
      engine.close();
    }
  }
}
if (failures) process.exitCode = 1;
