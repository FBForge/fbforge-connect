import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionFailure } from '../scripts/live-ui/interaction-diagnostics.mjs';

test('live interaction diagnostics distinguish blocked controls without exposing call-log contents', () => {
  const secret = 'FICTITIOUS-PRIVATE-VALUE';
  const result = interactionFailure(
    new Error(
      `locator.click: Timeout 45000ms exceeded. element is not enabled; intercepts pointer events; ${secret}`,
    ),
  );
  assert.equal(result.timeout, true);
  assert.equal(result.disabled, true);
  assert.equal(result.covered, true);
  assert.equal(result.ambiguous, false);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(Object.values(result).every((value) => typeof value === 'boolean'));
});

test('live diagnostics distinguish ambiguity, visibility and detachment', () => {
  assert.equal(interactionFailure(new Error('strict mode violation')).ambiguous, true);
  assert.equal(interactionFailure(new Error('element is not visible')).hidden, true);
  assert.equal(interactionFailure(new Error('element is not stable')).unstable, true);
  assert.equal(interactionFailure(new Error('element is outside of the viewport')).outsideViewport, true);
  assert.equal(interactionFailure(new Error('element was detached from the DOM')).detached, true);
  assert.ok(Object.values(interactionFailure(new Error('unrecognized private text'))).every((v) => !v));
});
