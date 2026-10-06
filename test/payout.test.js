import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame, inventoryValue } from "../dist/js/game.js";
import { getSpecial } from "../dist/js/skills.js";

function setup(actor, skills) {
  const game = new CasinoDuelGame();
  game.difficulty = "normal";
  game.startMatch();
  game.startRound(actor);
  game.phase = "playing";
  game.setBet("player", { chips: { blue: 1 } });
  game.setBet("dealer", { chips: { blue: 1 } });
  game.skills[actor] = skills.map(getSpecial);
  game[actor] = [{ rank: "K" }, { rank: "Q" }];
  game[actor === "player" ? "dealer" : "player"] = [{ rank: "8" }, { rank: "9" }];
  for (const skill of skills) assert.equal(game.applySpecial(actor, skill).ok, true);
  return game;
}

for (const actor of ["player", "dealer"]) {
  for (const [skills, payout] of [[[], 1000], [["double"], 2000], [["triple"], 3000], [["double", "triple"], 6000], [["triple", "double"], 6000]]) {
    test(`${actor}: ${skills.join(" + ") || "normal"} pays ${payout} from a normal 1000 payout`, () => {
      const game = setup(actor, skills);
      assert.equal(game.winPayoutFor(actor), payout);
      const result = game.settle();
      assert.equal(inventoryValue(result.returns[actor]), payout);
      assert.equal(result.grossDeltas[actor], payout - 500);
      assert.equal(game.chips[actor], 2500 + payout);
    });
  }
}

test("stacked multipliers do not multiply draws or losses", () => {
  for (const lose of [false, true]) {
    const game = setup("player", ["double", "triple"]);
    game.player = [{ rank: "8" }, { rank: "9" }];
    game.dealer = [{ rank: "K" }, { rank: lose ? "Q" : "7" }];
    const result = game.settle();
    assert.equal(inventoryValue(result.returns.player), lose ? 0 : 500);
    assert.equal(result.grossDeltas.player, lose ? -500 : 0);
  }
});

test("repayment uses the extra profit without consuming the returned original bet", () => {
  const game = setup("player", ["double"]);
  game.debts.player = 1000;
  const result = game.settle();
  assert.equal(result.grossDeltas.player, 1500);
  assert.equal(result.repayments.player, 1000);
  assert.equal(inventoryValue(result.returns.player), 1000);
  assert.equal(game.debts.player, 0);
});

for (const [difficulty, factor] of [["easy", 1.3], ["normal", 2], ["hard", 3]]) {
  for (const skills of [[], ["double"], ["triple"], ["double", "triple"]]) {
    test(`${difficulty} pays the stake times ${factor} with ${skills.join("+") || "no skills"}`, () => {
      const game = new CasinoDuelGame();
      game.difficulty = difficulty;
      game.startMatch();
      game.phase = "playing";
      game.player = [{ rank: "K" }, { rank: "Q" }];
      game.dealer = [{ rank: "8" }, { rank: "9" }];
      game.setBet("player", { chips: { red: 1 } });
      game.setBet("dealer", { chips: { red: 1 } });
      game.skills.player = skills.map(getSpecial);
      for (const skill of skills) game.applySpecial("player", skill);
      const expected = Math.round(100 * factor * skills.reduce((n, s) => n * (s === "double" ? 2 : 3), 1));
      assert.equal(game.winPayoutFor("player"), expected);
      const result = game.settle();
      assert.equal(inventoryValue(result.returns.player), expected);
      assert.equal(game.chips.player, 2900 + expected);
    });
  }
}

test("fractional payouts remain available to bet and survive an online snapshot", () => {
  const game = setup("player", []);
  game.difficulty = "easy";
  const result = game.settle();
  assert.equal(inventoryValue(result.returns.player), 650);
  assert.equal(game.inventories.player.white, 50);
  const guest = new CasinoDuelGame();
  guest.restore(game.snapshot());
  assert.equal(guest.inventories.player.white, 50);
  assert.equal(game.setBet("player", { chips: { white: 30 } }).amount, 30);
  assert.equal(game.inventories.player.white, 20);
});

test("two-player games keep the normal 2x payout independently of CPU difficulty", () => {
  const game = setup("player", []);
  game.difficulty = "easy";
  for (const mode of ["duo", "online"]) {
    game.mode = mode;
    assert.equal(game.winPayoutFor("player"), 1000);
  }
});
