import test from 'node:test';
import assert from 'node:assert/strict';
import { listReplies, listReplyChannels } from '../frontend/src/replies.js';

const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const session = { apiVersion: 'v2', sessionId: id, environment: 'TEST', connected: true };
const row = { replyId: id, caseId: other };
const page = { offset: 20, totalCount: 21, replies: [row] };
const envelope = (data, active = session) => ({
  apiVersion: active.apiVersion,
  sessionId: active.sessionId,
  environment: 'TEST',
  data,
});

test('v2 and v3 reply pickup reuses the exact TEST session and exposes only public identities', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const result = await listReplies(
      async (command, args) => {
        assert.equal(command, 'list_replies');
        assert.deepEqual(args, { apiVersion, sessionId: id, offset: 20 });
        return envelope(page, active);
      },
      active,
      20,
    );
    assert.deepEqual(result.replies, [row]);
    assert.ok(Object.isFrozen(result.replies[0]));
  }
});
test('inconsistent pagination, duplicate identities and additional payload fields fail closed', async () => {
  for (const patch of [
    { offset: 0 },
    { totalCount: 20 },
    { totalCount: 1000001 },
    { replies: [] },
    { totalCount: 22, replies: [row, row] },
    { replies: [{ ...row, caseId: null }] },
    { replies: [{ ...row, replyId: 'invalid' }] },
    { replies: [{ ...row, encryptedMetadata: 'synthetic' }] },
    { secret: 'synthetic' },
  ])
    await assert.rejects(
      listReplies(async () => envelope({ ...page, ...patch }), session, 20),
      /engine_protocol_error/,
    );
  assert.equal(
    (await listReplies(async () => envelope({ offset: 0, totalCount: 0, replies: [] }), session)).replies
      .length,
    0,
  );
  await assert.rejects(
    listReplies(async () => envelope({ offset: 0, totalCount: 21, replies: [row] }), session),
    /engine_protocol_error/,
  );
});
test('reply pages reject foreign native context and invalid offsets before invocation', async () => {
  for (const patch of [{ apiVersion: 'v3' }, { sessionId: other }, { environment: 'PROD' }])
    await assert.rejects(
      listReplies(async () => ({ ...envelope(page), ...patch }), session, 20),
      /engine_protocol_error/,
    );
  for (const offset of [-20, 1, 10020, Infinity, '0'])
    await assert.rejects(
      listReplies(() => assert.fail('Invalid offset reached native code'), session, offset),
      /invalid_input/,
    );
});

test('local reply channels expose immutable case-bound public references in the exact native session', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const active = { ...session, apiVersion };
    const channel = {
      attemptId: id,
      destinationId: other,
      fromDestinationId: apiVersion === 'v3' ? id : null,
      caseId: id,
      submissionId: other,
      keyId: `reply-key:${id}`,
      status: 'bound',
    };
    const result = await listReplyChannels(async (command, args) => {
      assert.equal(command, 'list_reply_channels');
      assert.deepEqual(args, { apiVersion, sessionId: id });
      return envelope({ channels: [channel] }, active);
    }, active);
    assert.deepEqual(result, [channel]);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result[0]));
    for (const patch of [
      { keyId: `reply-key:${other}` },
      { status: 'bound', caseId: null },
      { status: 'unresolved' },
      { privateKey: 'unexpected' },
      { attemptId: 'invalid' },
    ])
      await assert.rejects(
        listReplyChannels(async () => envelope({ channels: [{ ...channel, ...patch }] }, active), active),
        /engine_protocol_error/,
      );
    await assert.rejects(
      listReplyChannels(async () => envelope({ channels: [channel, channel] }, active), active),
      /engine_protocol_error/,
    );
    assert.equal(
      (
        await listReplyChannels(
          async () =>
            envelope(
              { channels: [{ ...channel, status: 'unresolved', caseId: null, submissionId: null }] },
              active,
            ),
          active,
        )
      )[0].status,
      'unresolved',
    );
    await assert.rejects(
      listReplyChannels(
        async () => ({ ...envelope({ channels: [channel] }, active), environment: 'PROD' }),
        active,
      ),
      /engine_protocol_error/,
    );
  }
});
