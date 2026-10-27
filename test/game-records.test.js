import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame, inventoryValue } from "../dist/js/game.js";
import { readGameRecords, recordBlackjackRound, recordBlackjackMatch, recordChipGain } from "../dist/js/game-records.js";

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
};
function round(outcome) {
  const game = new CasinoDuelGame();
  game.startMatch();
  game.phase = "playing";
  game.setBet("player", { chips: { blue: 1 } });
  game.setBet("dealer", { chips: { blue: 1 } });
  game.player = [{ rank: "10" }, { rank: "9" }];
  game.dealer = [{ rank: "10" }, { rank: outcome === "win" ? "8" : outcome === "loss" ? "K" : "9" }];
  return game.settle();
}

test("blackjack round payouts accumulate without counting rounds as games", () => {
  saved.clear();
  for (const outcome of ["win", "draw", "loss"]) {
    const result = round(outcome);
    assert.equal(result.matchComplete, false);
    recordBlackjackRound(result, outcome);
    recordBlackjackRound(result, outcome);
  }
  const stats = readGameRecords().blackjack;
  assert.equal(stats.matches, undefined);
  assert.equal(stats.gained, 1500);
  assert.equal(stats.net, undefined);
});

test("gain-only history remains usable when round counters are introduced", () => {
  saved.clear();
  recordChipGain("blackjack", 700, "old");
  recordBlackjackRound(round("win"), "new");
  recordBlackjackMatch({ matchComplete: true, matchOutcome: "win" }, "new-game");
  const stats = readGameRecords().blackjack;
  assert.equal(stats.matches, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.gained, 1700);
  assert.equal(stats.net, undefined);
});

test("records remain isolated between account tokens", () => {
  saved.clear();
  localStorage.setItem("casinoDuel.accountToken", "first");
  const result = round("win");
  recordBlackjackRound(result, "same");
  localStorage.setItem("casinoDuel.accountToken", "second");
  assert.deepEqual(readGameRecords(), {});
  recordBlackjackRound(result, "same");
  assert.equal(readGameRecords().blackjack.gained, inventoryValue(result.returns.player));
  localStorage.setItem("casinoDuel.accountToken", "first");
  assert.equal(readGameRecords().blackjack.matches, undefined);
});

test("only final game outcomes count and repeats do not duplicate games or payouts", () => {
  saved.clear();
  recordBlackjackMatch({ matchComplete: false, matchOutcome: null }, "unfinished");
  assert.deepEqual(readGameRecords(), {});
  for (const outcome of ["win", "loss", "draw"]) {
    const result = { matchComplete: true, matchOutcome: outcome };
    recordBlackjackMatch(result, outcome);
    recordBlackjackMatch(result, outcome);
  }
  const stats = readGameRecords().blackjack;
  assert.equal(stats.matches, 3);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.draws, 1);
  assert.equal(stats.gained ?? 0, 0);
});
