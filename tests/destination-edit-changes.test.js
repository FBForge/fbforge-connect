import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationEditChanges } from '../frontend/src/destinations/edit-changes.js';
const baseline = {
  name: 'Nord',
  status: 'active',
  metadataVersions: ['2.0.0', '3.0.0'],
  contact: { email: 'test@example.org', phone: null },
  offers: { publicServices: [{ id: 'service' }], processMessages: [] },
};
const form = () => ({
  baseline,
  name: 'Nord',
  status: 'active',
  versions: '2.0.0, 3.0.0',
  contacts: { email: { value: 'test@example.org', enabled: false }, phone: { value: '', enabled: false } },
  offers: structuredClone(baseline.offers),
  enabled: { name: false, status: false, versions: false, offers: false },
});
test('single edit sends only actual changes, preserving untouched contacts, status and offers', () => {
  const input = form();
  assert.deepEqual(destinationEditChanges(input), {});
  input.name = 'Nord neu';
  assert.deepEqual(destinationEditChanges(input), { name: 'Nord neu' });
  input.name = 'Nord';
  input.contacts.email.value = '';
  assert.deepEqual(destinationEditChanges(input), { contactInformation: { email: null } });
  input.contacts.email.value = 'test@example.org';
  input.enabled.offers = true;
  assert.deepEqual(destinationEditChanges(input), {});
  input.offers.publicServices = [];
  assert.deepEqual(destinationEditChanges(input), { publicServices: [] });
});
test('bulk changes require explicit selection, including clearing a contact', () => {
  const input = form();
  input.baseline = null;
  input.name = '{name} Test';
  input.contacts.email.value = '';
  assert.deepEqual(destinationEditChanges(input), {});
  input.enabled.name = true;
  input.contacts.email.enabled = true;
  assert.deepEqual(destinationEditChanges(input), {
    name: '{name} Test',
    contactInformation: { email: null },
  });
});
