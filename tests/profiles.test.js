import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listProfiles,
  openSavedProfile,
  forgetProfile,
  profileStatus,
  exportProfileBackup,
  importProfileBackup,
  importProfileBackupFile,
  updateProfile,
} from '../frontend/src/profiles.js';
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const profile = {
  profileId: id(1),
  name: 'Bauamt TEST',
  clientId: 'synthetic-profile-client',
  apiVersion: 'v3',
  role: 'online-service',
  keyCount: 2,
  available: true,
};
test('profile list accepts public metadata only and rejects unexpected secrets and duplicate handles', async () => {
  const profiles = await listProfiles(async () => [profile]);
  assert.ok(Object.isFrozen(profiles));
  assert.ok(Object.isFrozen(profiles[0]));
  for (const bad of [
    [profile, profile],
    [{ ...profile, secret: 'synthetic-marker' }],
    [{ ...profile, profileId: '../elsewhere' }],
    [{ ...profile, keyCount: 177 }],
  ])
    await assert.rejects(
      listProfiles(async () => bad),
      /engine_protocol_error/,
    );
  const unavailable = {
    ...profile,
    clientId: null,
    apiVersion: null,
    role: null,
    keyCount: 0,
    available: false,
  };
  assert.equal((await listProfiles(async () => [unavailable]))[0].available, false);
});

test('dropped profile backups forward bounded ciphertext and erase the IPC buffer after success or failure', async () => {
  const magic = 'FIT-Connect Test-Client protected profile v1\n';
  for (const fails of [false, true]) {
    let buffer;
    const action = importProfileBackupFile(
      async (command, bytes) => {
        assert.equal(command, 'import_profile_backup_file');
        assert.ok(bytes instanceof Uint8Array);
        assert.equal(new TextDecoder().decode(bytes), magic + 'synthetic-ciphertext');
        buffer = bytes;
        if (fails) throw 'vault_unavailable';
        return profile;
      },
      new Blob([magic, 'synthetic-ciphertext']),
    );
    if (fails) await assert.rejects(action, (cause) => cause === 'vault_unavailable');
    else assert.equal((await action).profileId, profile.profileId);
    assert.ok(buffer.every((value) => value === 0));
  }
  for (const file of [
    new Blob(['plaintext is not a backup']),
    {
      size: 9 * 1024 * 1024,
      arrayBuffer() {
        assert.fail('oversized backup read');
      },
    },
  ])
    await assert.rejects(
      importProfileBackupFile(() => assert.fail('invalid backup reached IPC'), file),
      /vault_invalid/,
    );
});
test('saved profile opens only the selected API and returns a fresh TEST session without private material', async () => {
  const session = {
    sessionId: id(2),
    apiVersion: 'v3',
    role: 'online-service',
    environment: 'TEST',
    connected: true,
  };
  assert.equal(
    (
      await openSavedProfile(async (command, args) => {
        assert.equal(command, 'open_saved_profile');
        assert.deepEqual(args, { profileId: profile.profileId, restoreKeys: true });
        return session;
      }, profile)
    ).sessionId,
    id(2),
  );
  for (const patch of [
    { apiVersion: 'v2' },
    { environment: 'PROD' },
    { privateJwk: 'synthetic-marker' },
    { connected: false },
  ])
    await assert.rejects(
      openSavedProfile(async () => ({ ...session, ...patch }), profile),
      /engine_protocol_error/,
    );
  await assert.rejects(
    openSavedProfile(() => assert.fail('Unavailable profile reached native'), {
      ...profile,
      available: false,
    }),
    /invalid_input/,
  );
});
test('profile forgetting checks acknowledgement and storage status distinguishes session-only from failed saving', async () => {
  await forgetProfile(async () => null, profile.profileId);
  await assert.rejects(
    forgetProfile(async () => ({}), profile.profileId),
    /engine_protocol_error/,
  );
  assert.equal(
    (await profileStatus(async () => ({ profileId: null, saved: false, error: null }), id(2))).saved,
    false,
  );
  assert.equal(
    (
      await profileStatus(
        async () => ({ profileId: profile.profileId, saved: false, error: 'vault_unavailable' }),
        id(2),
      )
    ).error,
    'vault_unavailable',
  );
  for (const value of [
    { profileId: null, saved: true, error: null },
    { profileId: profile.profileId, saved: true, error: 'vault_unavailable' },
    { profileId: profile.profileId, saved: false, error: null },
  ])
    await assert.rejects(
      profileStatus(async () => value, id(2)),
      /engine_protocol_error/,
    );
});

test('backup commands expose only native-dialog outcomes and public imported profile metadata', async () => {
  assert.equal(
    await exportProfileBackup(async (command, args) => {
      assert.equal(command, 'export_profile_backup');
      assert.deepEqual(args, { profileId: profile.profileId });
      return true;
    }, profile.profileId),
    true,
  );
  await assert.rejects(
    exportProfileBackup(async () => ({ privateJwk: 'forbidden' }), profile.profileId),
    /engine_protocol_error/,
  );
  assert.equal(await importProfileBackup(async () => null), null);
  assert.deepEqual(await importProfileBackup(async () => profile), { ...profile, environment: 'TEST' });
  await assert.rejects(
    importProfileBackup(async () => ({ ...profile, clientSecret: 'forbidden' })),
    /engine_protocol_error/,
  );
});
test('profile editing binds name/id, never echoes a new secret and preserves native authentication failures', async () => {
  const renamed = { ...profile, name: 'Bauamt TEST neu' };
  assert.equal(
    (
      await updateProfile(
        async (command, args) => {
          assert.equal(command, 'update_profile');
          assert.equal(args.newSecret, 'synthetic-new-secret');
          return renamed;
        },
        profile.profileId,
        renamed.name,
        'synthetic-new-secret',
      )
    ).name,
    renamed.name,
  );
  await assert.rejects(
    updateProfile(async () => ({ ...renamed, profileId: id(8) }), profile.profileId, renamed.name),
    /engine_protocol_error/,
  );
  await assert.rejects(
    updateProfile(
      async () => {
        throw new Error('authentication_failed');
      },
      profile.profileId,
      renamed.name,
      'wrong',
    ),
    /authentication_failed/,
  );
});
