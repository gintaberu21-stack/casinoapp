import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { Store } from "../server/store.js";
import { rouletteAction } from "../server/roulette.js";
import { slotAction } from "../server/slot.js";
import { cachedWalletBalance, syncWalletResponse } from "../dist/js/shared-wallet.js";

test("wallet cache preserves the shared account and accepts a genuine zero balance", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(cachedWalletBalance(), null);
  localStorage.setItem("casinoDuel.accountProfile", JSON.stringify({ name: "A", chips: 500, debt: 100 }));
  assert.equal(cachedWalletBalance(), 500);
  assert.equal(syncWalletResponse({ error: "locked", balance: 500 }), 500);
  assert.equal(cachedWalletBalance(), 500);
  assert.equal(syncWalletResponse({ balance: 0 }), 0);
  assert.equal(cachedWalletBalance(), 0);
  assert.equal(JSON.parse(localStorage.getItem("casinoDuel.accountProfile")).debt, 100);
  assert.equal(syncWalletResponse({ error: "offline" }), null);
});

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
for (const game of ["roulette", "slot"]) {
  for (const online of [true, false]) {
    test(`${game}: ${online ? "active bets stay locked with the real balance" : "orphan bets do not block the shared wallet"}`, async () => {
      const store = new Store();
      const token = "shared-wallet-test-token";
      const account = await store.createAccount(token, "A");
      await store.updateAccount(account.playerId, { chips: 500, inventory: { red: 5, blue: 0, black: 0 },
        pendingBet: { amount: 100, chips: { red: 1 } } });
      let handler;
      const context = vm.createContext({
        app: { post: (path, callback) => { handler = callback; } },
        enqueue: callback => callback(), store,
        sockets: online ? new Map([[account.playerId, { peerId: null }]]) : new Map(),
        accountKeyFor: value => value, publicAccount: value => value,
        rouletteAction, slotAction, sendTo() {},
      });
      const start = source.indexOf(`app.post("/api/${game}/:action"`);
      const end = source.indexOf("\n);", start) + 4;
      vm.runInContext(source.slice(start, end), context);
      let status = 200, body;
      const response = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
      await handler({ params: { action: "state" }, get: () => "Bearer " + token, body: {} }, response);
      assert.equal(status, online ? 409 : 200);
      assert.equal(body.balance, 500);
      assert.equal(body.account.chips, 500);
      assert.equal((await store.findAccountById(account.playerId)).chips, 500);
      assert.equal(Boolean((await store.findAccountById(account.playerId)).pendingBet), online);
    });
  }
}
