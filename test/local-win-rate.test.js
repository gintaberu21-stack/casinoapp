import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { recordLocalMatchResult } from "../server/rankings.js";
import { localWinRate } from "../dist/js/game-records.js";
import { MatchScreen } from "../dist/js/matchUI.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("local match counts final results once and reverses the guest outcome", async () => {
  const store = new Store();
  const host = await store.createAccount("host", "Host");
  const guest = await store.createAccount("guest", "Guest");
  const match = { id: "match-1", hostId: host.playerId, guestId: guest.playerId };
  for (let round = 0; round < 3; round++) {
    assert.equal(await recordLocalMatchResult(store, match, { winner: "win" }), false);
  }
  assert.equal((await store.findAccountById(host.playerId)).localStats.matches, 0);
  assert.equal(await recordLocalMatchResult(store, match, { winner: "win", matchComplete: true }), true);
  assert.equal(await recordLocalMatchResult(store, match, { winner: "win", matchComplete: true }), false);
  await recordLocalMatchResult(store, { ...match, finished: false }, { winner: "win", matchComplete: true });
  assert.deepEqual((await store.findAccountById(host.playerId)).localStats, { matches: 1, wins: 1, losses: 0, draws: 0 });
  assert.deepEqual((await store.findAccountById(guest.playerId)).localStats, { matches: 1, wins: 0, losses: 1, draws: 0 });
  await recordLocalMatchResult(store, { ...match, id: "match-2", finished: false }, { winner: "draw", matchComplete: true });
  assert.equal(localWinRate((await store.findAccountById(host.playerId)).localStats), "50%");
  assert.equal((await store.findAccountById(guest.playerId)).localStats.draws, 1);
});

test("solo results do not change local stats, including existing accounts", async () => {
  const store = new Store();
  const account = await store.createAccount("solo", "Solo");
  delete store.memory.accounts.get("solo").localStats;
  await store.recordOutcome(account.playerId, "win");
  assert.equal(await recordLocalMatchResult(store, { id: "solo", hostId: account.playerId }, { winner: "win", matchComplete: true }), false);
  assert.equal(localWinRate((await store.findAccountById(account.playerId)).localStats), "0%");
  await store.recordLocalOutcome(account.playerId, "loss", "first-local");
  assert.deepEqual((await store.findAccountById(account.playerId)).localStats, { matches: 1, wins: 0, losses: 1, draws: 0 });
});

test("local win rate includes draws and rounds to one decimal", () => {
  assert.equal(localWinRate(), "0%");
  assert.equal(localWinRate({ matches: 3, wins: 1, losses: 1, draws: 1 }), "33.3%");
  assert.equal(localWinRate({ matches: 3, wins: 3 }), "100%");
});

test("room shows the correct rates from both host and guest perspectives", () => {
  for (const isHost of [true, false]) {
    const screen = Object.create(MatchScreen.prototype);
    screen.ui = { els: { "room-host-win-rate": {}, "room-guest-win-rate": {} } };
    screen.roomPlayers = { peerId: 2, isHost };
    screen.service = {
      account: { localStats: { matches: 4, wins: 3 } },
      player: () => ({ localStats: { matches: 4, wins: 1 } }),
    };
    screen.renderRoomRates();
    assert.equal(screen.els["room-host-win-rate"].textContent, `勝率 ${isHost ? 75 : 25}%`);
    assert.equal(screen.els["room-guest-win-rate"].textContent, `勝率 ${isHost ? 25 : 75}%`);
  }
});

test("local match stats and duplicate protection survive a store restart", async () => {
  const directory = await mkdtemp(path.resolve("../casino-local-stats-"));
  try {
    const filename = path.join(directory, "accounts.json");
    const store = new Store();
    await store.enableLocalPersistence(filename);
    const account = await store.createAccount("persistent", "Player");
    await store.recordLocalOutcome(account.playerId, "win", "saved-match");
    const restored = new Store();
    await restored.enableLocalPersistence(filename);
    await restored.recordLocalOutcome(account.playerId, "win", "saved-match");
    assert.deepEqual((await restored.findAccountById(account.playerId)).localStats, { matches: 1, wins: 1, losses: 0, draws: 0 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
