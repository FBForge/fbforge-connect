import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the packaged engine probes v2 and v3 in one process and exits on EOF', { timeout: 30000 }, async t => {
  const directory = fileURLToPath(new URL('../desktop/resources/engine/', import.meta.url));
  const java = fileURLToPath(new URL(`../desktop/resources/engine/runtime/bin/java${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
  const jar = fileURLToPath(new URL('../desktop/resources/engine/engine-host.jar', import.meta.url));
  const env = { ...process.env };
  for (const key of ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH']) delete env[key];
  const child = spawn(java, ['-jar', jar], { cwd: directory, env, stdio: ['pipe', 'pipe', 'ignore'] });
  t.after(() => child.kill());
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => signal ? reject(new Error('Engine terminated')) : resolve(code));
    child.stdin.on('error', reject);
  });
  for (const version of ['v2', 'v3']) {
    const body = Buffer.from(JSON.stringify({ protocolVersion: 1, id: `smoke-${version}`, command: 'probe', apiVersion: version }));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  }
  child.stdin.end();
  assert.equal(await exited, 0);
  const output = Buffer.concat(chunks);
  let offset = 0;
  for (const version of ['v2', 'v3']) {
    const length = output.readUInt32BE(offset);
    assert.ok(length > 0 && length <= 65536);
    offset += 4;
    const response = JSON.parse(output.subarray(offset, offset + length).toString('utf8'));
    offset += length;
    assert.equal(response.id, `smoke-${version}`);
    assert.equal(response.ok, true);
    assert.equal(response.result.apiVersion, version);
    assert.equal(response.result.isolated, true);
    assert.equal(response.result.environment, 'TEST');
  }
  assert.equal(offset, output.length, 'stdout contains only protocol frames');
});
