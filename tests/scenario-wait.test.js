import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaiter } from '../frontend/src/integration/scenarios/wait.ts';
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('observer backs off transient failures, resets after success and stops at a found message', async () => {
  let clock = 0,
    calls = 0;
  const timers = [],
    states = [],
    cancelled = [];
  const waiter = createWaiter({
    check: async () => {
      if (++calls <= 3) throw Error('fixture network failure');
      return calls === 5;
    },
    changed: (value) => states.push(value),
    now: () => clock,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    unschedule: (id) => cancelled.push(id),
  });
  waiter.start();
  await settle();
  for (const expected of [20000, 40000, 60000, 10000]) {
    const timer = timers.at(-1);
    assert.equal(timer.ms, expected);
    clock += timer.ms;
    timer.fn();
    await settle();
  }
  assert.equal(calls, 5);
  assert.equal(waiter.active, false);
  assert.match(states.at(-1).message, /Nachweis gefunden/);
  assert.equal(states.at(-1).lastChecked, clock);
  assert.equal(cancelled.length, 1);
});
test('stop and restart during an old request never creates overlapping reads or accepts its late result', async () => {
  let complete,
    calls = 0;
  const timers = [];
  const waiter = createWaiter({
    check: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
    now: () => 0,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    unschedule: () => {},
  });
  waiter.start();
  waiter.stop();
  waiter.start();
  assert.equal(calls, 1);
  assert.equal(timers[0].ms, 1000);
  complete(true);
  await settle();
  assert.equal(waiter.active, true);
  timers[0].fn();
  assert.equal(calls, 2);
  complete(true);
  await settle();
  assert.equal(waiter.active, false);
});
test('a response arriving after the deadline cannot be presented as a successful observation', async () => {
  let clock = 0,
    complete;
  const states = [];
  const waiter = createWaiter({
    check: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    now: () => clock,
    changed: (value) => states.push(value),
  });
  waiter.start();
  clock = 300001;
  complete(true);
  await settle();
  assert.equal(waiter.active, false);
  assert.match(states.at(-1).message, /Wartezeit abgelaufen/);
  assert.equal(states.at(-1).remaining, 0);
});
