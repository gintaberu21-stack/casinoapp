import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { rouletteAction } from '../server/roulette.js';

test('roulette uses shared chips and does not charge retries twice', async () => {
  const store = new Store();
  const account = await store.createAccount('roulette', 'TEST');
  const body = { requestId:'test-roulette-request-0001', bets:{ red:100, 'n:0':100 } };
  const result = await rouletteAction(store, account, 'spin', body);
  assert.equal(result.balance, 3000 - 200 + result.result.payout);
  const updated = await store.findAccount('roulette');
  const retry = await rouletteAction(store, updated, 'spin', body);
  assert.deepEqual(retry, result);
  assert.equal(updated.rouletteStats.matches, 1);
  const inv = updated.inventory;
  assert.equal(inv.black*1000 + inv.blue*500 + inv.red*100 + (inv.white||0),result.balance);
});
test('roulette rejects invalid bets, insufficient balance and overlapping slot', async () => {
  const store = new Store();
  const account = await store.createAccount('bad-bets', 'TEST');
  const requestId = 'test-roulette-request-0002';
  for (const bets of [{red:50},{red:3100},{invalid:100},{red:-100},{}]) {
    await assert.rejects(rouletteAction(store,account,'spin',{requestId,bets}));
  }
  account.slotRound = { done:false };
  await assert.rejects(rouletteAction(store,account,'spin',{requestId,bets:{red:100}}));
  assert.equal(account.chips,3000);
});
