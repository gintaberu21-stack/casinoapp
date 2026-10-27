import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { Store } from "../server/store.js";

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const releaseSource = server.slice(server.indexOf("async function releasePeer("), server.indexOf("const wss ="));
for (const seat of ["host", "guest"]) {
  for (const activeBet of [true, false]) {
    test(`${seat} disconnect: pending=${activeBet}, only the survivor is refunded once`, async () => {
      const store = new Store();
      const a = await store.createAccount("host", "A");
      const b = await store.createAccount("guest", "B");
      const profile = { chips: 2500, inventory: { red: 5, blue: 2, black: 1 }, debt: 100,
        pendingBet: activeBet ? { chips: { blue: 1 }, amount: 500 } : null };
      await store.updateAccount(a.playerId, structuredClone(profile));
      await store.updateAccount(b.playerId, structuredClone(profile));
      const host = { playerId: a.playerId, peerId: b.playerId };
      const guest = { playerId: b.playerId, peerId: a.playerId };
      const departing = seat === "host" ? host : guest;
      const remaining = seat === "host" ? guest : host;
      const messages = [];
      const context = vm.createContext({
        store, INVENTORY_TYPES: ["red", "blue", "black", "white"],
        sockets: new Map([[a.playerId, host], [b.playerId, guest]]),
        publicAccount: account => account, send: (socket, message) => messages.push({ socket, message }),
      });
      vm.runInContext(releaseSource, context);
      await context.releasePeer(departing, "left");
      assert.equal((await store.findAccountById(departing.playerId)).chips, 2500);
      assert.equal((await store.findAccountById(departing.playerId)).pendingBet, null);
      const survivor = await store.findAccountById(remaining.playerId);
      assert.equal(survivor.chips, activeBet ? 3000 : 2500);
      assert.equal(survivor.inventory.blue, activeBet ? 3 : 2);
      assert.equal(survivor.debt, 100);
      assert.equal(survivor.pendingBet, null);
      assert.ok(messages.some(({ message }) => message.type === "left"));
      await context.releasePeer(departing, "left");
      await context.releasePeer(remaining, "left");
      assert.equal((await store.findAccountById(remaining.playerId)).chips, activeBet ? 3000 : 2500);
    });
  }
}
test("solo disconnect clears pending bets without returning the deducted stake", async () => {
  const store = new Store();
  const account = await store.createAccount("solo", "A");
  await store.updateAccount(account.playerId, { chips: 2500, pendingBet: { amount: 500, chips: { blue: 1 } } });
  const context = vm.createContext({ store });
  vm.runInContext(releaseSource, context);
  await context.releasePeer({ playerId: account.playerId, peerId: null }, "left");
  const updated = await store.findAccountById(account.playerId);
  assert.equal(updated.chips, 2500);
  assert.equal(updated.pendingBet, null);
});

test("closing a connection discards stale profiles before reconnecting", async () => {
  const source = await readFile(new URL("../dist/js/match.js", import.meta.url), "utf8");
  const listeners = {};
  class Socket {
    addEventListener(event, callback) { listeners[event] = callback; }
    close() { listeners.close(); }
  }
  const pageEvents = {};
  const context = vm.createContext({
    EventTarget, localStorage: { getItem: () => null },
    window: { addEventListener: (event, callback) => { pageEvents[event] = callback; } },
    WebSocket: Socket, waitForBackend: async () => {}, websocketUrl: () => "ws://test",
  });
  vm.runInContext(source.replace(/^import[^\n]+\n/gm, "").replace("export class MatchService", "globalThis.MatchService = class MatchService"), context);
  const service = new context.MatchService();
  service.emit = () => {};
  service.scheduleRetry = () => {};
  await service.connect();
  service.pendingProfile = { type: "profile", own: { chips: 9999, activeBet: true } };
  pageEvents.pagehide();
  assert.equal(service.pendingProfile, null);
  assert.equal(service.socket, null);
  assert.equal(service.connected, false);
});
