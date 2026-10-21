import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useSendActivity } from '../frontend/src/send/useSendActivity.ts';

const session = {
  sessionId: 'synthetic-session',
  apiVersion: 'v3',
  role: 'online-service',
  environment: 'TEST',
  connected: true,
};
function fixture() {
  const events = [];
  const state = {
    working: ref(false),
    actionOpener: ref(null),
    error: ref(''),
    confirmedSession: ref(null),
    outcome: ref(null),
    progress: ref(''),
  };
  const controller = useSendActivity({
    props: { busy: false, session },
    state,
    explain: () => 'Verständlicher Fehler',
    emit: (...args) => events.push(args),
  });
  return { ...controller, state, events };
}

test('send activity blocks overlap and retains an uncertain outcome without retrying', async () => {
  globalThis.document = { activeElement: null };
  const { act, state, events } = fixture();
  let finish,
    calls = 0;
  const first = act('Senden', async () => {
    calls++;
    await new Promise((resolve) => {
      finish = resolve;
    });
    state.outcome.value = { status: 'uncertain' };
  });
  await act('Erneut senden', async () => {
    calls++;
  });
  assert.equal(calls, 1);
  finish();
  await first;
  assert.equal(state.working.value, false);
  assert.equal(events.find(([event]) => event === 'activity')[1].status, 'Ausgang ungewiss');
  assert.equal(events.filter(([event]) => event === 'activity').length, 1);
});

test('cancelled schema consent clears busy state without presenting an application failure', async () => {
  globalThis.document = { activeElement: null };
  const { act, state, events } = fixture();
  await act('Schema laden', async () => {
    throw new Error('content_cancelled');
  });
  assert.equal(state.error.value, '');
  assert.equal(state.working.value, false);
  assert.equal(events.find(([event]) => event === 'activity')[1].status, 'Abgebrochen');
  assert.equal(
    events.some(([event]) => event === 'fatal'),
    false,
  );
});

test('fatal native failure emits invalidation once and always releases the busy state', async () => {
  globalThis.document = { activeElement: null };
  const { act, state, events } = fixture();
  await act('Vorbereiten', async () => {
    throw new Error('engine_disconnected');
  });
  assert.equal(state.error.value, 'Verständlicher Fehler');
  assert.equal(state.working.value, false);
  assert.equal(state.progress.value, '');
  assert.equal(events.filter(([event]) => event === 'fatal').length, 1);
  assert.deepEqual(
    events.filter(([event]) => event === 'busy'),
    [
      ['busy', true],
      ['busy', false],
    ],
  );
});
