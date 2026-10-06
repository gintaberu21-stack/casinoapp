import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame, inventoryValue, valueToInventory } from "../dist/js/game.js";
import { getSpecial } from "../dist/js/skills.js";

for (const [difficulty, factor] of [["easy", 1.3], ["normal", 2], ["hard", 3]]) {
  for (const actor of ["player", "dealer"]) {
    test(`${difficulty} ${actor}: repeated loans distribute red chips and preserve net worth`, () => {
      const game = new CasinoDuelGame();
      game.difficulty = difficulty;
      game.chips[actor] = 0;
      game.inventories[actor] = valueToInventory(0);
      for (let count = 1; count <= 2; count++) {
        game.takeLoan(actor);
        assert.equal(game.inventories[actor].red, count * 5);
        assert.equal(game.inventories[actor].blue, 0);
        assert.equal(game.chips[actor], count * 500);
        assert.equal(game.debts[actor], count * 500);
        assert.equal(game.chips[actor] - game.debts[actor], 0);
      }
    });
    for (const outcome of ["win", "draw", "loss"]) {
      for (const [balance, debt] of [[100, 500], [500, 500], [1000, 500], [500, 2000]]) {
        for (const skills of [[], ["double", "triple"]]) {
          test(`${difficulty} ${actor}: ${outcome}, wallet ${balance}, debt ${debt}, skills ${skills.length}`, () => {
            const game = new CasinoDuelGame();
            game.difficulty = difficulty;
            game.phase = "playing";
            game.actor = actor;
            game.inventories[actor] = { red: balance / 100, blue: 0, black: 0 };
            game.chips[actor] = balance;
            game.debts[actor] = debt;
            game.setBet(actor, { chips: { red: 1 } });
            const other = actor === "player" ? "dealer" : "player";
            game.setBet(other, { chips: { red: 1 } });
            game.skills[actor] = skills.map(getSpecial);
            for (const skill of skills) assert.equal(game.applySpecial(actor, skill).ok, true);
            game[actor] = [{ rank: "10" }, { rank: outcome === "loss" ? "7" : "10" }];
            game[other] = [{ rank: "10" }, { rank: outcome === "win" ? "7" : "10" }];
            const payout = outcome === "win" ? Math.round(100 * factor * (skills.length ? 6 : 1)) : outcome === "draw" ? 100 : 0;
            const beforeRepay = balance - 100 + payout;
            const expectedRepay = Math.min(debt, Math.max(0, beforeRepay - 100));
            const result = game.settle();
            assert.equal(result.repayments[actor], expectedRepay);
            assert.equal(game.debts[actor], debt - expectedRepay);
            assert.equal(game.chips[actor], beforeRepay - expectedRepay);
            assert.equal(inventoryValue(game.inventories[actor]), game.chips[actor]);
            assert.equal(result.deltas[actor], payout - 100 - expectedRepay);
            assert.equal(result.netWorth[actor], balance - debt + payout - 100);
            if (expectedRepay) assert.ok(game.chips[actor] >= 100);
            const copy = new CasinoDuelGame();
            copy.restore(game.snapshot());
            assert.equal(copy.chips[actor], game.chips[actor]);
            assert.equal(copy.debts[actor], game.debts[actor]);
          });
        }
      }
    }
    test(`${difficulty} ${actor}: borrowing then betting all five red chips`, () => {
      const game = new CasinoDuelGame();
      game.difficulty = difficulty;
      game.chips[actor] = 0;
      game.inventories[actor] = valueToInventory(0);
      game.takeLoan(actor);
      game.phase = "playing";
      game.setBet(actor, { chips: { red: 5 } });
      const other = actor === "player" ? "dealer" : "player";
      game.setBet(other, { chips: { red: 1 } });
      game[actor] = [{ rank: "10" }, { rank: "10" }];
      game[other] = [{ rank: "10" }, { rank: "7" }];
      const result = game.settle();
      const payout = 500 * factor;
      assert.equal(result.repayments[actor], Math.min(500, payout - 100));
      assert.equal(game.chips[actor], payout - Math.min(500, payout - 100));
      assert.equal(inventoryValue(game.inventories[actor]), game.chips[actor]);
    });
  }
}
