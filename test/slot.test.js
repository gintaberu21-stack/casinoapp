import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { slotAction, slotPayout } from '../server/slot.js';

test('stop preserves the tapped position despite network delay and retries', async () => {
  const store = new Store();
  await store.createAccount('instant-stop', 'TEST');
  const get = () => store.findAccount('instant-stop');
  const start = await slotAction(store, await get(), 'start', { bet:100 }, 1000);
  const roundId = start.round.id;
  for (const index of [-1, 30, 1.5, null, '2']) {
    await assert.rejects(slotAction(store, await get(), 'stop', { roundId, reel:0, index }, 5000));
  }
  const left = await slotAction(store, await get(), 'stop', { roundId, reel:0, index:0 }, 5000);
  assert.equal(left.round.indices[0], 0);
  const retry = await slotAction(store, await get(), 'stop', { roundId, reel:0, index:9 }, 9000);
  assert.equal(retry.round.indices[0], 0);
  await slotAction(store, await get(), 'stop', { roundId, reel:1, index:8 }, 10000);
  const result = await slotAction(store, await get(), 'stop', { roundId, reel:2, index:6 }, 12000);
  assert.deepEqual(result.round.indices, [0,8,6]);
  assert.equal(result.round.win, 10000);
  assert.equal(result.balance, 12900);
});

test('slot pays both diagonals, including strip wraparound', () => {
  assert.equal(slotPayout([1,8,5],100),10000);
  assert.equal(slotPayout([29,8,7],100),10000);
  assert.equal(slotPayout([0,8,6],100),10000);
  assert.equal(slotPayout([1,1,1],100),0);
});

test('slot debit and payout share account chips; retries do not pay twice', async () => {
  const store = new Store();
  const get = () => store.findAccount('slot-test');
  await store.createAccount('slot-test', 'TEST');
  const start = await slotAction(store, await get(), 'start', { bet:100 }, 1000);
  assert.equal(start.balance, 2900);
  await assert.rejects(slotAction(store, await get(), 'start', { bet:100 }, 1001));
  const id = start.round.id;
  let result;
  for (const reel of [0,1,2]) result = await slotAction(store, await get(), 'stop', { roundId:id, reel }, 1500);
  assert.equal(result.balance, 2900 + result.round.win);
  const retry = await slotAction(store, await get(), 'stop', { roundId:id, reel:2 }, 5000);
  assert.equal(retry.balance, result.balance);
  const inventory = (await get()).inventory;
  assert.equal(inventory.black*1000 + inventory.blue*500 + inventory.red*100 + (inventory.white||0), result.balance);
});

test('reloading completes pending round once; invalid bets and round IDs fail', async () => {
  const store = new Store();
  const get = () => store.findAccount('recover');
  await store.createAccount('recover', 'TEST');
  await assert.rejects(slotAction(store, await get(), 'start', { bet:999 }, 1000));
  await slotAction(store, await get(), 'start', { bet:100 }, 1000);
  await assert.rejects(slotAction(store, await get(), 'stop', { roundId:'wrong', reel:0 }, 2000));
  const recovered = await slotAction(store, await get(), 'state', {}, 3000);
  assert.equal(recovered.round.done, true);
  const again = await slotAction(store, await get(), 'state', {}, 5000);
  assert.equal(again.balance, recovered.balance);
  assert.equal(slotPayout([0,8,6], 50), 5000);
  assert.equal(slotPayout([3,0,0], 50), 100);
});
