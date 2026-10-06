import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame } from "../dist/js/game.js";

function gameAt(difficulty, score, player = 20) {
  const game = new CasinoDuelGame();
  game.difficulty = difficulty;
  game.dealer = [{ rank: "10" }, { rank: String(score - 10) }];
  game.player = [{ rank: "10" }, { rank: String(player - 10) }];
  return game;
}

for (const [difficulty, threshold] of [["easy", 19], ["normal", 20]]) {
  test(`${difficulty} hits below ${threshold} and stops at or above it`, () => {
    assert.equal(gameAt(difficulty, threshold - 1).dealerShouldHit(), true);
    assert.equal(gameAt(difficulty, threshold).dealerShouldHit(), false);
    assert.equal(gameAt(difficulty, 21).dealerShouldHit(), false);
  });
  test(`${difficulty} allows an incidental 21 to win`, () => {
    const game = gameAt(difficulty, 21);
    game.startMatch();
    game.phase = "playing";
    game.dealer = [{ rank: "10" }, { rank: "A" }];
    game.player = [{ rank: "10" }, { rank: "9" }];
    game.setBet("player", { chips: { red: 1 } });
    game.setBet("dealer", { chips: { red: 1 } });
    assert.equal(game.settle().outcome, "loss");
  });
}

test("hard draws below 17, chases a stronger hand, and stops at 21", () => {
  assert.equal(gameAt("hard", 16, 15).dealerShouldHit(), true);
  assert.equal(gameAt("hard", 17, 17).dealerShouldHit(), false);
  assert.equal(gameAt("hard", 20, 21).dealerShouldHit(), true);
  assert.equal(gameAt("hard", 21, 21).dealerShouldHit(), false);
});
