import test from 'node:test';
import assert from 'node:assert/strict';
import { useFlowContext } from '../frontend/src/app/useFlowContext.js';
function fixture() {
  const events = [];
  const profile = { profileId: 'saved', environment: 'TEST', apiVersion: 'v3' };
  const state = Object.fromEntries(
    Object.entries({
      busy: false,
      environment: 'TEST',
      error: '',
      activeSession: { sessionId: 'old' },
      storageStatus: { profileId: 'saved' },
      apiVersion: 'v3',
      selectedDestination: '',
      defaultDestinations: null,
      testDraft: null,
      receiveTab: 'submissions',
    }).map(([key, value]) => [key, { value }]),
  );
  state.navigate = async (name) => events.push(name);
  state.connections = {
    profiles: { value: [profile] },
    refreshProfiles: async () => {},
    connectProfile: async () => {
      events.push('connect');
      return true;
    },
    changeApi: async () => {},
    showConnection: () => events.push('manual'),
  };
  return { state, events, open: useFlowContext(state) };
}
test('flow contexts use the assigned profile and destination and route reply checks to the sender inbox', async () => {
  const f = fixture();
  f.state.receiveTab.value = 'replies';
  f.state.defaultDestinations.value = { sourceDestination: 'existing-source', receiverDestination: 'old' };
  await f.open({
    side: 'receiver',
    receiverProfileId: 'saved',
    apiVersion: 'v3',
    receiverDestination: 'destination',
  });
  assert.deepEqual(f.events, ['connect', 'Empfangen']);
  assert.equal(f.state.selectedDestination.value, 'destination');
  assert.equal(f.state.receiveTab.value, 'submissions');
  assert.deepEqual(f.state.defaultDestinations.value, {
    sourceDestination: 'existing-source',
    receiverDestination: 'destination',
  });
  f.events.length = 0;
  await f.open({ side: 'sender', senderProfileId: 'saved', apiVersion: 'v3', step: 'check_reply' });
  assert.equal(f.state.receiveTab.value, 'replies');
  assert.deepEqual(f.events, ['connect', 'Empfangen']);
});
test('missing profiles, declined API changes and busy sessions never route or write', async () => {
  const f = fixture();
  await f.open({ side: 'receiver', receiverProfileId: 'missing', apiVersion: 'v3' });
  assert.deepEqual(f.events, []);
  assert.match(f.state.error.value, /nicht verfügbar/);
  await f.open({ side: 'receiver', apiVersion: 'v2' });
  assert.deepEqual(f.events, []);
  f.state.busy.value = true;
  await f.open({ side: 'receiver', receiverProfileId: 'saved', apiVersion: 'v3' });
  assert.deepEqual(f.events, []);
});

test('declining a same-profile or manual-context change preserves the current destination and view', async () => {
  const f = fixture();
  f.state.connections.connectProfile = async () => false;
  await f.open({
    side: 'receiver',
    receiverProfileId: 'saved',
    apiVersion: 'v3',
    receiverDestination: 'new',
  });
  assert.deepEqual(f.events, []);
  assert.equal(f.state.selectedDestination.value, '');
  const manual = fixture();
  manual.state.beforeChange = async () => false;
  await useFlowContext(manual.state)({ side: 'receiver', apiVersion: 'v3', receiverDestination: 'new' });
  assert.deepEqual(manual.events, []);
  assert.equal(manual.state.selectedDestination.value, '');
  const manualBusy = fixture();
  manualBusy.state.beforeChange = async () => {
    manualBusy.state.busy.value = true;
    return true;
  };
  await useFlowContext(manualBusy.state)({ side: 'receiver', apiVersion: 'v3', receiverDestination: 'new' });
  assert.deepEqual(manualBusy.events, []);
  assert.equal(manualBusy.state.selectedDestination.value, '');
});

test('authorized context changes still navigate while the new connection hydrates its keys', async () => {
  const f = fixture();
  f.state.connections.connectProfile = async () => {
    f.state.activeSession.value = { sessionId: 'new' };
    f.state.busy.value = true;
    return true;
  };
  await f.open({
    side: 'receiver',
    receiverProfileId: 'saved',
    apiVersion: 'v3',
    receiverDestination: 'target',
  });
  assert.deepEqual(f.events, ['Empfangen']);
  assert.equal(f.state.selectedDestination.value, 'target');
  const manual = fixture();
  manual.state.connections.changeApi = async (api) => {
    manual.state.apiVersion.value = api;
    manual.state.busy.value = true;
  };
  await manual.open({ side: 'sender', apiVersion: 'v2' });
  assert.deepEqual(manual.events, ['Senden']);
});
