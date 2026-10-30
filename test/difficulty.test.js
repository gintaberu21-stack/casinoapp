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

for (const [difficulty, threshold] of [["normal", 17]]) {
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

for (const difficulty of ["normal", "hard"]) {
  test(`${difficulty} protects a winning hand and chases a finished stronger hand`, () => {
    const winning = gameAt(difficulty, 16, 15);
    winning.stood.player = true;
    assert.equal(winning.dealerShouldHit(), false);
    const behind = gameAt(difficulty, 19, 20);
    behind.stood.player = true;
    assert.equal(behind.dealerShouldHit(), true);
    const tied = gameAt(difficulty, 19, 19);
    tied.stood.player = true;
    assert.equal(tied.dealerShouldHit(), false);
    for (const score of [17, 18, 19, 20])
      assert.equal(gameAt(difficulty, score, 15).dealerShouldHit(), false);
  });
}

test("hard can improve a soft 17 without risking an immediate bust", () => {
  const game = gameAt("hard", 17, 15);
  game.dealer = [{rank:"A"}, {rank:"6"}];
  assert.equal(game.dealerShouldHit(), true);
});
