import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { inventoryValue } from "../dist/js/game.js";

test("old fractional account balances are rounded up once and persisted", async () => {
  const store = new Store();
  const account = await store.createAccount("legacy", "test");
  Object.assign(store.memory.accounts.get("legacy"), { chips: 314, inventory: { red: 3, white: 14 } });
  const loaded = await store.findAccount("legacy");
  assert.equal(loaded.chips, 400);
  assert.equal(inventoryValue(loaded.inventory), 400);
  assert.equal(loaded.inventory.white, undefined);
  assert.equal((await store.findAccountById(account.playerId)).chips, 400);
  assert.equal(store.memory.accounts.get("legacy").chips, 400);
});

test("account updates preserve a hundred-chip wallet even with old clients", async () => {
  const store = new Store();
  const account = await store.createAccount("old-client", "test");
  const updated = await store.updateAccount(account.playerId, { chips: 14, inventory: { white: 14 } });
  assert.equal(updated.chips, 100);
  assert.equal(inventoryValue(updated.inventory), 100);
  assert.equal((await store.findAccount("old-client")).chips, 100);
});
