import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { recordBlackjackGains } from "../server/rankings.js";
import { rouletteAction } from "../server/roulette.js";
import { slotAction } from "../server/slot.js";

test("all IDs are ranked by current chips, not cumulative payouts", async () => {
  const store = new Store();
  const accounts = [];
  for (const name of ["A", "B", "C", "D", "E"]) accounts.push(await store.createAccount(name, name));
  await store.recordChipGain(accounts[0].playerId, 999999, "old-round", "slot");
  for (const [index, chips] of [500, 5000, 3000, 500, 0].entries())
    await store.updateAccount(accounts[index].playerId, { chips });
  const ranking = await store.leaderboard();
  assert.deepEqual(ranking.map(p => p.playerId), [2, 3, 1, 4, 5]);
  assert.deepEqual(ranking.map(p => p.rank), [1, 2, 3, 4, 5]);
  assert.equal(ranking[0].chips, 5000);
  assert.equal(ranking[4].chips, 0);
  assert.deepEqual(Object.keys(ranking[0]).sort(), ["chips", "name", "playerId", "rank"]);
  await store.updateAccount(accounts[0].playerId, { chips: 90000, debt: 500 });
  assert.equal((await store.leaderboard())[0].playerId, 1);
  assert.equal((await store.leaderboard())[0].chips, 90000);
});

test("blackjack round gains use active stakes and cannot be counted twice", async () => {
  const store = new Store();
  const host = await store.createAccount("host", "A");
  const guest = await store.createAccount("guest", "B");
  for (const account of [host, guest]) await store.updateAccount(account.playerId, {
    pendingBet: { amount: 500, chips: { blue: 1 } },
  });
  const payload = { id: "blackjack-round-event-00001", outcome: "win",
    returns: { player: { blue: 2 }, dealer: {} } };
  await recordBlackjackGains(store, host.playerId, guest.playerId, payload);
  await recordBlackjackGains(store, host.playerId, guest.playerId, payload);
  await recordBlackjackGains(store, host.playerId, guest.playerId, { ...payload, id: "different-round-event-0002" });
  assert.equal((await store.findAccountById(host.playerId)).gainedChips, 1000);
  assert.equal((await store.findAccountById(guest.playerId)).gainedChips, 0);
  await store.updateAccount(host.playerId, { pendingBet: null });
  await recordBlackjackGains(store, host.playerId, null, { ...payload, id: "no-active-stake-event-0003" });
  assert.equal((await store.findAccountById(host.playerId)).gainedChips, 1000);
});

test("roulette and slot payouts contribute to the same ID and retries do not inflate scores", async () => {
  const store = new Store();
  const account = await store.createAccount("combined", "A");
  const spin = await rouletteAction(store, account, "spin", {
    requestId: "roulette-ranking-test-0001", bets: { red: 100 },
  });
  let updated = await store.findAccount("combined");
  assert.equal(updated.gainedChips, spin.result.payout);
  await rouletteAction(store, updated, "spin", { requestId: spin.result.id, bets: { red: 100 } });
  const started = await slotAction(store, await store.findAccount("combined"), "start", { bet: 100 }, 0);
  let result;
  for (const reel of [0, 1, 2]) {
    result = await slotAction(store, await store.findAccount("combined"), "stop",
      { roundId: started.round.id, reel, index: [0, 8, 6][reel] }, 100);
  }
  await slotAction(store, await store.findAccount("combined"), "state", {}, 200);
  updated = await store.findAccount("combined");
  assert.equal(updated.gainedChips, spin.result.payout + result.round.win);
  assert.equal(updated.gainedByGame.slot, result.round.win);
});

test("Mongo gain writes are atomic and the database ranking query excludes account secrets", async () => {
  let write, query;
  const database = { collection: () => ({
    findOneAndUpdate: async (...args) => { write = args; return { playerId: 7, gainedChips: 100 }; },
    find: (...args) => { query = args; return { toArray: async () => [
      { playerId: 7, name: "A", chips: 100 }, { playerId: 2, name: "B" },
    ] }; },
  }) };
  const store = new Store(database);
  await store.recordChipGain(7, 100, "event", "slot");
  assert.deepEqual(write[0], { playerId: 7, gainEventIds: { $ne: "slot:event" } });
  assert.equal(write[1].$inc.gainedChips, 100);
  assert.equal(write[1].$addToSet.gainEventIds, "slot:event");
  const ranking = await store.leaderboard();
  assert.deepEqual(query[1].projection, { _id: 0, playerId: 1, name: 1, chips: 1 });
  assert.equal(ranking[0].playerId, 7);
});

test("podium includes all top-three names and the list includes every remaining ID", async () => {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.classList = { add() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
  }
  globalThis.document = { createElement: tag => new Node(tag), getElementById: () => null };
  const { renderRankings } = await import("../dist/js/rankings.js");
  const container = new Node("div");
  const players = Array.from({ length: 8 }, (_, i) => ({
    rank: i + 1, playerId: i + 1, name: i === 0 ? "<script>name</script>" : "NAME" + (i + 1),
    chips: 8000 - i * 100,
  }));
  renderRankings(container, players, 5);
  const podium = container.children[1], list = container.children[2];
  assert.deepEqual(podium.children.map(card => card.children[1].children[0].textContent),
    ["NAME2", "<script>name</script>", "NAME3"]);
  assert.equal(list.children.length, 5);
  assert.equal(list.children[4].children[1].children[0].textContent, "NAME8");
  assert.ok(container.children[0].textContent.includes("5位"));
});
