// TEST-only regression probe. It changes only the uniquely named destination created by this run.
const root = 'https://test.fit-connect.fitko.dev/destination-api/v3/destinations/';
const auth = 'https://auth-testing.fit-connect.fitko.dev/token';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};

export async function probeSenderRestrictions({
  destination,
  senderDestination,
  runName,
  clientId,
  clientSecret,
  exchange,
  request = fetch,
  report = console.log,
}) {
  check(
    uuid.test(destination) && uuid.test(senderDestination) && runName.startsWith('FBForge Connect CI '),
    'restriction_fixture_invalid',
  );
  const tokenResponse = await request(auth, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  check(tokenResponse.ok, 'restriction_auth_failed');
  const token = (await tokenResponse.json()).access_token;
  check(typeof token === 'string' && token.length > 0, 'restriction_auth_failed');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/merge-patch+json' };
  const call = async (method, patch) => {
    const response = await request(root + destination, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers,
      ...(patch ? { body: JSON.stringify(patch) } : {}),
    });
    check(response.ok, 'restriction_configuration_failed');
    return method === 'GET' ? response.json() : null;
  };
  const before = await call('GET');
  check(before.destinationId === destination && before.name === runName, 'restriction_fixture_not_owned');
  check(
    !before.senderAccessRestricted?.enabled &&
      !before.senderAccessRestricted?.allowedSenders?.length &&
      !before.senderAccessRestricted?.allowedSenderDestinations?.length,
    'restriction_fixture_not_empty',
  );
  let enabled = false;
  try {
    enabled = true;
    await call('PATCH', {
      senderAccessRestricted: { enabled: true, allowedSenderDestinations: [senderDestination] },
    });
    const configured = (await call('GET')).senderAccessRestricted;
    check(
      configured?.enabled === true &&
        configured.allowedSenderDestinations?.length === 1 &&
        configured.allowedSenderDestinations[0] === senderDestination &&
        !configured.allowedSenders?.length,
      'restriction_readback_failed',
    );
    const failed = [];
    let repeatV2 = false,
      v3Passed = false;
    for (const api of ['v2', 'v3']) {
      try {
        await exchange(api);
        if (api === 'v3') v3Passed = true;
        report(`Sender restriction with destination allowlist only: ${api} passed`);
      } catch (error) {
        if (api === 'v2' && error.definiteAuthorizationRejection === true) repeatV2 = true;
        failed.push(api);
        report(`Sender restriction with destination allowlist only: ${api} failed`);
      }
    }
    // A fresh comparison after v3 tests propagation delay. Never repeat an uncertain write.
    if (repeatV2 && v3Passed) {
      try {
        await exchange('v2');
        report('Sender restriction: fresh v2 session after successful v3 passed');
      } catch {
        report('Sender restriction: fresh v2 session after successful v3 still failed');
      }
    }
    check(failed.length === 0, `restriction_${failed.join('_')}_failed`);
  } finally {
    if (enabled)
      await call('PATCH', { senderAccessRestricted: { enabled: false, allowedSenderDestinations: [] } });
  }
}
