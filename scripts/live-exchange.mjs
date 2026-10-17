// Trusted Windows TEST acceptance harness, never bundled with the desktop application.
// It creates one uniquely named receiving destination, uses fictitious data and cleans up only that ID.
import { NativeEngine, secretNames } from './native-test-engine.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const requireCheck = (value, code = 'acceptance_check_failed') => {
  if (!value) throw new Error(code);
};
requireCheck(process.platform === 'win32', 'windows_required');
for (const secretName of secretNames)
  requireCheck(Boolean(process.env[secretName]), 'actions_secret_missing');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridge = join(root, 'desktop/native-contracts/target/debug/examples/profile-checkpoint.exe');
const directory = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'fitconnect-live-'));
const runName = `FIT-Connect Test-Client CI ${randomUUID()}`;
const applicationUri = 'urn:fit-connect:test-client:demo:application:1';
const replyUri = 'urn:fit-connect:test-client:demo:reply:1';
const xmlUri = 'urn:fit-connect:test-client:ci:xml:1';
const xmlSchema =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="antrag"><xs:complexType><xs:sequence><xs:element name="vorname" type="xs:string"/><xs:element name="anliegen" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema>';
const modelId = 'urn:fit-connect:test-client:demo:process:1';
const requestMessage = { processModelId: modelId, messageId: 'application' };
const responseMessage = { processModelId: modelId, messageId: 'request-more' };
const service = 'urn:de:fim:leika:leistung:99000000000000';
const profiles = new Map(),
  engines = new Set();
let destination = null,
  creationBundle = null,
  receiverV3 = null,
  stage = 'initialization';
const cleanEnvironment = () => {
  const env = { ...process.env };
  for (const key of [...secretNames, 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS'])
    delete env[key];
  return env;
};
function protectedBridge(mode, profileId, value) {
  const input = value === undefined ? undefined : Buffer.from(JSON.stringify(value));
  try {
    const result = spawnSync(bridge, [mode, directory, profileId], {
      input,
      env: cleanEnvironment(),
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
    });
    requireCheck(result.status === 0 && !result.error, 'protected_checkpoint_failed');
    return mode === 'load' ? JSON.parse(result.stdout.toString('utf8')) : null;
  } finally {
    input?.fill(0);
  }
}
async function openNativeSession(label, api) {
  const native = new NativeEngine();
  engines.add(native);
  const role = label === 'sender' ? 'online-service' : 'administrative-system';
  const session = await native.call(api, 'open_session', {
    role,
    clientId: process.env[label === 'sender' ? 'SENDERID' : 'SUBSCRIBERID'],
    clientSecret: process.env[label === 'sender' ? 'SENDERSECRET' : 'SUBSCRIBERSECRET'],
  });
  requireCheck(
    session.connected && session.environment === 'TEST' && session.role === role,
    'session_context_invalid',
  );
  return {
    native,
    api,
    label,
    sessionId: session.sessionId,
    async call(command, fields = {}) {
      const result = await native.call(api, command, { sessionId: session.sessionId, ...fields });
      if (result && Object.hasOwn(result, 'data')) {
        requireCheck(
          result.sessionId === session.sessionId &&
            result.apiVersion === api &&
            result.environment === 'TEST',
          'session_context_invalid',
        );
        return result.data;
      }
      return result;
    },
  };
}
async function checkpoint(engine) {
  const keys = [];
  for (let offset = 0; offset <= 176; offset++) {
    const value = await engine.call('export_session_item', { offset });
    if (value.item === null) break;
    keys.push(value.item);
    requireCheck(offset < 176, 'checkpoint_limit');
  }
  const tag = `${engine.label}-${engine.api}`;
  const id = profiles.get(tag) || randomUUID();
  profiles.set(tag, id);
  protectedBridge('save', id, {
    version: 1,
    profileId: id,
    name: 'Temporary live acceptance checkpoint',
    apiVersion: engine.api,
    role: engine.label === 'sender' ? 'online-service' : 'administrative-system',
    clientId: 'ci-checkpoint-only',
    clientSecret: 'not-an-oauth-credential',
    keys,
  });
}
async function restore(engine, fromTag = `${engine.label}-${engine.api}`, select = () => true) {
  requireCheck(profiles.has(fromTag), 'checkpoint_missing');
  for (const item of protectedBridge('load', profiles.get(fromTag)).filter(select))
    await engine.call('restore_session_item', { archiveDocument: JSON.stringify(item) });
}
async function upload(engine, input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const { contentId } = await engine.call('begin_content', { totalBytes: bytes.length });
  for (let offset = 0; offset < bytes.length; offset += 12000)
    await engine.call('append_content', {
      contentId,
      byteOffset: offset,
      chunk: bytes.subarray(offset, offset + 12000).toString('base64'),
    });
  return contentId;
}
async function parts(engine, proofId, reply = false) {
  const suffix = reply ? '_reply' : '';
  const all = [];
  let total;
  do {
    const page = await engine.call(`list_received${suffix}_contents`, { proofId, offset: all.length });
    total = page.total;
    all.push(...page.parts);
    requireCheck(all.length <= 41 && (page.parts.length || all.length === total), 'content_page_invalid');
  } while (all.length < total);
  const output = new Map();
  for (const item of all) {
    const chunks = [];
    let offset = 0;
    while (offset < item.totalBytes) {
      const page = await engine.call(`read_received${suffix}_content`, {
        proofId,
        contentId: item.contentId,
        byteOffset: offset,
      });
      const bytes = Buffer.from(page.chunk, 'base64');
      requireCheck(bytes.length && offset + bytes.length <= item.totalBytes, 'content_chunk_invalid');
      chunks.push(bytes);
      offset += bytes.length;
    }
    output.set(item.kind, Buffer.concat(chunks));
  }
  return output;
}
async function readEventually(operation) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 3 || !error.message.endsWith(': resource_missing')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
async function verifiedLog(engine, command, fields, expectedEvent = null) {
  const result = await engine.call(command, fields);
  requireCheck(
    result.total > 0 &&
      result.warnings.length === 1 &&
      result.warnings[0] === 'CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED',
    'signed_event_log_failed',
  );
  if (expectedEvent) {
    let found = false;
    for (let offset = 0; offset < result.total; offset += 5) {
      const page = await engine.call('list_event_log', { logId: result.logId, offset });
      found ||= page.events.some((entry) => entry.eventType === expectedEvent);
    }
    requireCheck(found, 'receipt_event_missing');
  }
}
async function exchange(api, format, withProcess = false, receiptAction = 'accept') {
  stage = `${api}_${withProcess ? 'process' : format}${receiptAction === 'reject' ? '_reject' : ''}`;
  let sender = await openNativeSession('sender', api);
  const receiver = api === 'v3' ? receiverV3 : await openNativeSession('subscriber', api);
  if (api === 'v2') await restore(receiver, 'subscriber-v3', (item) => Boolean(item.destinationKey));
  const xml = format === 'xml';
  const schemaUri = xml ? xmlUri : applicationUri,
    mimeType = xml ? 'application/xml' : 'application/json';
  const data = Buffer.from(
    xml
      ? '<antrag><vorname>Erika</vorname><anliegen>Fiktiver Alpha-Test</anliegen></antrag>'
      : JSON.stringify({
          antragstellendePerson: { vorname: 'Erika', nachname: 'Musterfrau' },
          anliegen: 'Fiktiver Alpha-Test ohne echte Personendaten',
          referenz: stage,
        }),
  );
  // Non-compressible fictitious bytes force the SDK's 4 MiB fragment path.
  const attachment =
    api === 'v3' && xml
      ? randomBytes(5 * 1024 * 1024)
      : Buffer.from('Fiktive TEST-Anlage. Keine echten Personendaten.');
  const draft = {
    destinationId: destination,
    fromDestinationId: api === 'v3' ? process.env.SENDERDEST : null,
    serviceIdentifier: service,
    serviceName: 'Fiktiver Alpha-Test',
    region: 'DE',
    schemaUri,
    mimeType,
    caseId: null,
    processMessage: withProcess ? requestMessage : null,
    replyOffer: {
      schemaUri: replyUri,
      mimeType: 'application/json',
      processMessages: withProcess ? [responseMessage] : [],
    },
    contentId: await upload(sender, data),
    attachments: [
      {
        contentId: await upload(sender, attachment),
        fileName: 'alpha-test.txt',
        mimeType: 'text/plain',
        description: 'Fiktive Testanlage',
      },
    ],
  };
  const prepared = await sender.call('prepare_send', { sendDocument: JSON.stringify(draft) });
  await checkpoint(sender); // Actual Windows DPAPI, before any reply key is published.
  const sent = await sender.call('execute_send', { attemptId: prepared.attempt.attemptId });
  await checkpoint(sender);
  requireCheck(sent.status === 'sent', `submission_${sent.status}`);
  console.log(`${stage}: one native send confirmed`);
  const localSchemas = xml ? [{ uri: xmlUri, contentId: await upload(receiver, xmlSchema) }] : [];
  const proof = await readEventually(() =>
    receiver.call('verify_submission', {
      destinationId: destination,
      submissionId: sent.submissionId,
      schemaDocument: JSON.stringify({ schemas: localSchemas }),
    }),
  );
  requireCheck(
    proof.warningCount === proof.warnings.length &&
      proof.warnings.every((code) => code === 'MALWARE_SCAN_NOT_CONFIGURED'),
    'receive_warning',
  );
  const received = await parts(receiver, proof.proofId);
  requireCheck(
    received.get('data')?.equals(data) && received.get('attachment')?.equals(attachment),
    'received_bytes_differ',
  );
  requireCheck(
    JSON.stringify(proof.processMessage || null) === JSON.stringify(withProcess ? requestMessage : null),
    'process_mapping_invalid',
  );
  await verifiedLog(receiver, 'load_event_log', {
    destinationId: destination,
    caseId: sent.caseId,
    submissionId: sent.submissionId,
  });
  await verifiedLog(receiver, 'load_case_event_log', { caseId: sent.caseId });
  const schema = await receiver.call('load_reply_schema', {
    proofId: proof.proofId,
    schemaDocument: JSON.stringify({
      schemaUri: replyUri,
      mimeType: 'application/json',
      allowExternalSchemas: false,
      schemaContentId: null,
    }),
  });
  const replyData = Buffer.from(
    JSON.stringify({
      status: 'eingegangen',
      nachricht: 'Der fiktive Testantrag ist eingegangen.',
      geschaeftszeichen: stage,
    }),
  );
  const replyDraft = {
    proofId: proof.proofId,
    schemaId: schema.schemaId,
    schemaUri: replyUri,
    mimeType: 'application/json',
    processMessage: withProcess ? responseMessage : null,
    contentId: await upload(receiver, replyData),
    attachments: [],
  };
  const replyPreview = await receiver.call('prepare_reply', { replyDocument: JSON.stringify(replyDraft) });
  const reply = await receiver.call('execute_reply', { attemptId: replyPreview.attempt.attemptId });
  requireCheck(reply.status === 'sent', `reply_${reply.status}_${reply.error || 'unknown'}`);
  sender.native.close();
  engines.delete(sender.native);
  sender = await openNativeSession('sender', api);
  await restore(sender);
  const replyProof = await readEventually(() =>
    sender.call('verify_reply', {
      caseId: sent.caseId,
      replyId: reply.replyId,
      schemaDocument: '{"schemas":[]}',
    }),
  );
  await checkpoint(sender);
  requireCheck(
    replyProof.warningCount === replyProof.warnings.length &&
      replyProof.warnings.every((code) => code === 'MALWARE_SCAN_NOT_CONFIGURED') &&
      (await parts(sender, replyProof.proofId, true)).get('data')?.equals(replyData),
    'reply_verification_failed',
  );
  requireCheck(
    JSON.stringify(replyProof.processMessage || null) ===
      JSON.stringify(withProcess ? responseMessage : null),
    'reply_process_mapping_invalid',
  );
  await verifiedLog(sender, 'load_reply_event_log', { caseId: sent.caseId, replyId: reply.replyId });
  const replyReceipt = await sender.call('prepare_reply_receipt', {
    receiptDocument: JSON.stringify({
      caseId: sent.caseId,
      replyId: reply.replyId,
      action: receiptAction,
      reason: receiptAction === 'reject' ? 'technical-error' : null,
      description: receiptAction === 'reject' ? 'Fiktive technische Ablehnung für die Alpha-Abnahme' : null,
      attachmentId: null,
      proofId: receiptAction === 'accept' ? replyProof.proofId : null,
    }),
  });
  requireCheck(
    (await sender.call('execute_reply_receipt', { attemptId: replyReceipt.attempt.attemptId })).status ===
      'confirmed',
    'reply_receipt_failed',
  );
  const receipt = await receiver.call('prepare_receipt', {
    receiptDocument: JSON.stringify({
      destinationId: destination,
      submissionId: sent.submissionId,
      caseId: sent.caseId,
      action: receiptAction,
      signingKid: null,
      reason: receiptAction === 'reject' ? 'technical-error' : null,
      description: receiptAction === 'reject' ? 'Fiktive technische Ablehnung für die Alpha-Abnahme' : null,
      attachmentId: null,
      proofId: receiptAction === 'accept' ? proof.proofId : null,
    }),
  });
  requireCheck(
    (await receiver.call('execute_receipt', { attemptId: receipt.attempt.attemptId })).status === 'confirmed',
    'submission_receipt_failed',
  );
  await verifiedLog(
    sender,
    'load_reply_event_log',
    { caseId: sent.caseId, replyId: reply.replyId },
    `https://schema.fitko.de/fit-connect/events/${receiptAction}-reply`,
  );
  await verifiedLog(
    receiver,
    'load_event_log',
    {
      destinationId: destination,
      caseId: sent.caseId,
      submissionId: sent.submissionId,
    },
    `https://schema.fitko.de/fit-connect/events/${receiptAction}-submission`,
  );
  console.log(
    `${stage}: decrypted bytes/attachment, schema, signed submission/case/reply logs, reply after restart and both receipts passed`,
  );
  sender.native.close();
  engines.delete(sender.native);
  if (api === 'v2') {
    receiver.native.close();
    engines.delete(receiver.native);
  }
}
async function prepareReplySource() {
  stage = 'source_metadata_setup';
  const manager = await openNativeSession('sender', 'v3');
  try {
    const current = await manager.call('load_managed_destination', { destinationId: process.env.SENDERDEST });
    requireCheck(current.type === 'C' && current.status === 'active', 'source_configuration_invalid');
    const metadataVersions = [...new Set([...current.metadataVersions, '2.0.0', '3.0.0'])];
    if (metadataVersions.length !== current.metadataVersions.length) {
      const preview = await manager.call('prepare_destination_update', {
        destinationDocument: JSON.stringify({
          destinationIds: [process.env.SENDERDEST],
          changes: { metadataVersions },
        }),
      });
      const result = await manager.call('execute_destination_update', { attemptId: preview.attemptId });
      requireCheck(
        result.status === 'completed' && result.changes[0]?.status === 'updated',
        'source_metadata_update_failed',
      );
    }
    const configured = JSON.parse(
      (await manager.call('load_send_destination', { destinationId: process.env.SENDERDEST })).detailsJson,
    );
    requireCheck(
      configured.metadataVersions.includes('2.0.0') && configured.metadataVersions.includes('3.0.0'),
      'source_metadata_readback_failed',
    );
    console.log(
      'TEST source reply metadata versions verified; missing versions added with a field-only native PATCH',
    );
  } finally {
    manager.native.close();
    engines.delete(manager.native);
  }
}
async function cleanupManagedFixture(manager, fixtureId, fixtureName, fixtureType) {
  // The ID comes only from this run's native creation. Never delete an existing configured destination.
  const detail = await manager.call('load_managed_destination', { destinationId: fixtureId });
  requireCheck(detail.name === fixtureName && detail.type === fixtureType, 'cleanup_ownership_conflict');
  if (['created', 'draft'].includes(detail.status)) {
    const p = await manager.call('prepare_destination_cleanup', { destinationId: fixtureId });
    requireCheck(
      (await manager.call('execute_destination_cleanup', { attemptId: p.attemptId })).status === 'removed',
      'cleanup_failed',
    );
  } else {
    // An activated destination has a server-enforced retention period. Deactivate our
    // exact fixture and read that policy; do not try to bypass it with a DELETE.
    if (detail.status === 'active') {
      const p = await manager.call('prepare_destination_update', {
        destinationDocument: JSON.stringify({
          destinationIds: [fixtureId],
          changes: { status: 'inactive' },
        }),
      });
      await manager.call('execute_destination_update', { attemptId: p.attemptId });
    }
    const current = await manager.call('load_managed_destination', { destinationId: fixtureId });
    requireCheck(current.status === 'inactive' && current.name === fixtureName, 'cleanup_state_conflict');
    const tokenResponse = await fetch('https://auth-testing.fit-connect.fitko.dev/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env[manager.label === 'sender' ? 'SENDERID' : 'SUBSCRIBERID'],
        client_secret: process.env[manager.label === 'sender' ? 'SENDERSECRET' : 'SUBSCRIBERSECRET'],
      }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    requireCheck(tokenResponse.ok, 'cleanup_auth_failed');
    const token = await tokenResponse.json();
    requireCheck(typeof token.access_token === 'string', 'cleanup_auth_invalid');
    const result = await fetch(
      `https://test.fit-connect.fitko.dev/destination-api/v3/destinations/${fixtureId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      },
    );
    requireCheck(result.ok, `cleanup_http_${result.status}`);
    const retained = await result.json();
    const until = Date.parse(retained.canBeDecommissionedAt);
    requireCheck(
      retained.destinationId === fixtureId &&
        retained.name === fixtureName &&
        retained.type === fixtureType &&
        retained.status === 'inactive' &&
        retained.publicForRouting === false &&
        Number.isFinite(until) &&
        until > Date.now(),
      'cleanup_retention_unconfirmed',
    );
    console.log(
      `Temporary owned TEST destination inactive; server retention until ${new Date(until).toISOString()}; ID ${fixtureId}`,
    );
    return;
  }
  console.log('Temporary owned TEST destination removed');
}
async function cleanup() {
  if (!destination && creationBundle) {
    const matches = [];
    for (let offset = 0; offset <= 100; offset += 20) {
      const page = await receiverV3.call('list_destinations', { offset });
      matches.push(...page.destinations.filter((item) => item.name === runName && item.type === 'A'));
      if (offset + page.destinations.length >= page.totalCount) break;
    }
    requireCheck(matches.length <= 1, 'cleanup_destination_ambiguous');
    if (matches.length === 1) {
      await receiverV3.call('reconcile_destination_creation', {
        bundleId: creationBundle,
        destinationId: matches[0].destinationId,
      });
      destination = matches[0].destinationId;
    }
  }
  if (destination) {
    await cleanupManagedFixture(receiverV3, destination, runName, 'A');
    destination = null;
  }
}

try {
  await prepareReplySource();
  stage = 'destination_setup';
  receiverV3 = await openNativeSession('subscriber', 'v3');
  const keys = await receiverV3.call('generate_test_keys');
  creationBundle = keys.bundleId;
  await checkpoint(receiverV3);
  const configuration = {
    name: runName,
    type: 'A',
    contactInformation: {
      legalName: 'Fiktive CI-Testbehoerde',
      address: 'Musterstrasse 1, 12345 Musterstadt',
      phone: '+49 30 000000',
      email: 'test@example.invalid',
    },
    metadataVersions: ['2.0.0', '3.0.0'],
    publicServices: [
      {
        identifier: service,
        regions: ['DE'],
        submissionSchemas: [
          { schemaUri: applicationUri, mimeType: 'application/json' },
          { schemaUri: xmlUri, mimeType: 'application/xml' },
        ],
        replyChannels: { fitConnect: { processStandards: [replyUri] } },
      },
    ],
    processMessages: [
      {
        ...requestMessage,
        regions: ['DE'],
        schemas: [{ schemaUri: applicationUri, mimeType: 'application/json' }],
      },
    ],
  };
  const preview = await receiverV3.call('prepare_destination_creation', {
    destinationDocument: JSON.stringify({ bundleId: creationBundle, configuration }),
  });
  await receiverV3.call('mark_destination_creation_dispatch', { attemptId: preview.attemptId });
  await checkpoint(receiverV3);
  const created = await receiverV3.call('execute_destination_creation', { attemptId: preview.attemptId });
  await checkpoint(receiverV3);
  destination = created.destinationId;
  requireCheck(created.status === 'confirmed' && destination, `creation_${created.status}`);
  await receiverV3.call('use_generated_keys', { bundleId: creationBundle, destinationId: destination });
  await checkpoint(receiverV3);
  receiverV3.native.close();
  engines.delete(receiverV3.native);
  receiverV3 = await openNativeSession('subscriber', 'v3');
  await restore(receiverV3);
  const activation = await receiverV3.call('prepare_destination_update', {
    destinationDocument: JSON.stringify({ destinationIds: [destination], changes: { status: 'active' } }),
  });
  await receiverV3.call('execute_destination_update', { attemptId: activation.attemptId });
  requireCheck(
    (await receiverV3.call('load_managed_destination', { destinationId: destination })).status === 'active',
    'activation_failed',
  );
  console.log(
    'Native destination creation, exact registration readback, DPAPI checkpoint/restart and separate activation passed',
  );
  for (const api of ['v2', 'v3']) for (const format of ['json', 'xml']) await exchange(api, format);
  await exchange('v3', 'json', true);
  await exchange('v3', 'json', false, 'reject');
  stage = 'destination_rotation';
  const replacementKeys = await receiverV3.call('generate_test_keys');
  await checkpoint(receiverV3);
  const rotation = await receiverV3.call('prepare_destination_rotation', {
    destinationDocument: JSON.stringify({
      destinations: [{ destinationId: destination, bundleId: replacementKeys.bundleId }],
    }),
  });
  await receiverV3.call('mark_destination_rotation_dispatch', { attemptId: rotation.attemptId });
  await checkpoint(receiverV3);
  const rotated = await receiverV3.call('execute_destination_rotation', { attemptId: rotation.attemptId });
  await checkpoint(receiverV3);
  requireCheck(rotated.status === 'completed' && rotated.changes[0]?.status === 'updated', 'rotation_failed');
  await receiverV3.call('use_generated_keys', {
    bundleId: replacementKeys.bundleId,
    destinationId: destination,
  });
  await checkpoint(receiverV3);
  // Exchange again using the newly selected destination key, retaining the old keys.
  await exchange('v3', 'json');
  console.log('Native key rotation and exchange using the replacement key passed');
  console.log('Live TEST exchange acceptance completed');
} catch (error) {
  // Stable diagnostics only. Never echo SDK bodies, credential values or private checkpoint data.
  const code = /^[a-z0-9_]+(?:: [a-z_]+)?$/.test(error.message) ? error.message : 'acceptance_check_failed';
  console.error(`${stage}: ${code}`);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    const code = /^[a-z0-9_]+(?:: [a-z_]+)?$/.test(error.message) ? error.message : 'cleanup_failed';
    console.error(
      `TEST fixture cleanup: ${code}; generated destination requiring review: ${destination || 'unknown'}`,
    );
    process.exitCode = 1;
  }
  for (const engine of engines) engine.close();
  await rm(directory, { recursive: true, force: true });
}
