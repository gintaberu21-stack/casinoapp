import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame, inventoryValue } from "../dist/js/game.js";
import { TurnTimer, TURN_LIMIT_MS } from "../dist/js/turn-timer.js";
import { GameUI } from "../dist/js/ui.js";

test("turn clock expires once after 30 seconds and stale clocks cannot expire later turns", () => {
  let now = 0, tick, expired = 0, remaining;
  const timer = new TurnTimer({ now: () => now, schedule: fn => { tick = fn; return 1; }, cancel() {} });
  timer.start(TURN_LIMIT_MS, { onTick: ms => remaining = ms, onTimeout: () => expired++ });
  assert.equal(remaining, 30000);
  const oldTick = tick;
  now = 25000; tick(); assert.equal(remaining, 5000); assert.equal(expired, 0);
  now = 30000; tick(); tick(); assert.equal(expired, 1);
  timer.start(60000, { onTimeout: () => expired++ });
  oldTick(); assert.equal(expired, 1);
  timer.stop(); now = 70000; tick(); assert.equal(expired, 1);
});

test("timeout warning appears at five seconds and includes the game-wide count", () => {
  const ui = Object.create(GameUI.prototype);
  const classes = new Set();
  const node = { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } };
  ui.els = { "turn-timer": node };
  const game = { mode: "duo", actor: "dealer", phase: "playing", turnTimeouts: { dealer: 1 }, turnDeadline: Date.now() + 4000 };
  ui.updateTurnTimer(game);
  assert.ok(classes.has("is-warning"));
  assert.ok(node.textContent.includes("PLAYER 2"));
  assert.ok(node.textContent.includes("1/2"));
  game.turnDeadline = 0; ui.updateTurnTimer(game); assert.equal(node.hidden, true);
});

for (const loser of ["player", "dealer"]) {
  test(`two timeouts across rounds forfeit the game: ${loser}`, () => {
    const game = new CasinoDuelGame();
    game.startMatch(); game.startRound("player");
    assert.equal(game.registerTurnTimeout(loser), false);
    game.startRound("dealer");
    assert.equal(game.turnTimeouts[loser], 1);
    assert.equal(game.registerTurnTimeout(loser), true);
    game.phase = "playing";
    game.setBet("player", { chips: { blue: 1 } });
    game.setBet("dealer", { chips: { blue: 1 } });
    // The forfeiting player has the stronger hand: timeout must still override it.
    game[loser] = [{ rank: "K" }, { rank: "Q" }];
    const winner = loser === "player" ? "dealer" : "player";
    game[winner] = [{ rank: "2" }, { rank: "3" }];
    const before = { ...game.chips };
    const result = game.settle({ forfeit: loser });
    assert.equal(result.matchComplete, true);
    assert.equal(result.forfeit, loser);
    assert.equal(result.matchOutcome, loser === "player" ? "loss" : "win");
    assert.equal(game.chips[loser], before[loser]);
    assert.equal(game.chips[winner], before[winner] + 500);
    assert.equal(inventoryValue(result.returns[loser]), 0);
    assert.equal(inventoryValue(result.returns[winner]), 500);
    const snapshot = game.snapshot({ swapSeats: true });
    const guest = new CasinoDuelGame(); guest.restore(snapshot);
    assert.equal(guest.turnTimeouts[winner], 2);
    game.startMatch(); assert.deepEqual(game.turnTimeouts, { player: 0, dealer: 0 });
  });
}

test("first timeout passes the turn; the same player's second timeout ends the game", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const app = await readFile(new URL("../dist/js/app.js", import.meta.url), "utf8");
  const clock = app.slice(app.indexOf("function stopTurnTimer("), app.indexOf("function clearTurnLock("));
  const game = new CasinoDuelGame();
  game.startMatch(); game.startRound("player"); game.phase = "playing";
  let passed = 0, forfeited;
  const context = vm.createContext({
    game, onlineRole: "host", matchInterrupted: false, rejectTurnChoice: null, onlinePendingSpecial: {},
    turnRemaining: 30000, turnTimer: { stop() {} }, Date,
    ui: { updateTurnTimer() {}, toast() {}, seatLabels: () => game.names,
      els: { "select-card-overlay": {}, "special-overlay": {} } },
    clearTurnLock() {}, passTurn: () => { passed++; game.actor = game.actor === "player" ? "dealer" : "player"; },
    enterTurn: async () => {}, finishRound: async value => { forfeited = value.forfeit; },
  });
  vm.runInContext(clock, context);
  await context.handleTurnTimeout();
  assert.equal(passed, 1);
  assert.equal(game.actor, "dealer");
  assert.equal(game.turnTimeouts.player, 1);
  assert.equal(forfeited, undefined);
  await context.handleTurnTimeout();
  assert.equal(passed, 2);
  assert.equal(game.turnTimeouts.dealer, 1);
  await context.handleTurnTimeout();
  assert.equal(forfeited, "player");
  assert.equal(passed, 2);
});

test("default browser timers keep their Window receiver", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const source = await readFile(new URL("../dist/js/turn-timer.js",import.meta.url),"utf8");
  const context = vm.createContext({});
  vm.runInContext(`
    let scheduled = 0, cancelled = 0;
    function setInterval(callback, delay) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      scheduled++; return 7;
    }
    function clearInterval(handle) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      cancelled++;
    }
    ${source.replaceAll("export ", "")}
    const timer = new TurnTimer();
    timer.start(Date.now() + 30000, {});
    timer.stop();
    if (scheduled !== 1 || cancelled !== 1) throw Error("timer lifecycle failed");
  `,context);
});