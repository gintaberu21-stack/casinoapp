import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame } from "../dist/js/game.js";
import { getSpecial } from "../dist/js/skills.js";

function attackGame(actor, skill) {
  const game = new CasinoDuelGame();
  const target = actor === "player" ? "dealer" : "player";
  game.phase = "playing";
  game.actor = actor;
  game[actor] = [{ id: "attack", rank: "7" }, { id: "other", rank: "4" }];
  game[target] = [{ id: "king", rank: "K" }, { id: "queen", rank: "Q" }];
  game.stood[target] = true;
  game.skills[actor] = [getSpecial(skill)];
  return { game, target };
}

for (const actor of ["player", "dealer"]) {
  for (const skill of ["selectReverse", "shuffle"]) {
    test(`${actor}'s ${skill} reopens a manually stood hand for the next turn`, () => {
      const { game, target } = attackGame(actor, skill);
      const result = game.applySpecial(actor, skill, { cardId: "king", actorCardId: "attack", opponentCardId: "king" });
      assert.equal(result.ok, true);
      assert.equal(game.score(target), skill === "shuffle" ? 17 : 10);
      game.refreshAutoStand();
      assert.equal(game.stood[target], false);
      assert.equal(game.autoStood[target], false);
      assert.equal(game.actor, actor, "the skill does not consume the attacker's turn");
      assert.equal(game.isRoundOver(), false);
      game.switchActor();
      assert.equal(game.actor, target);
      const guest = new CasinoDuelGame();
      guest.restore(game.snapshot({ swapSeats: true }));
      const guestTarget = target === "player" ? "dealer" : "player";
      assert.equal(guest.stood[guestTarget], false);
      assert.equal(guest.actor, guestTarget);
    });
  }
}

test("a changed hand at 21 or above stays automatically stood", () => {
  for (const rank of ["A", "K"]) {
    const { game, target } = attackGame("player", "shuffle");
    game[target] = [{ id: "king", rank: "2" }, { id: "ten1", rank: "10" }, { id: "ten2", rank: "10" }];
    game.player[0].rank = rank;
    game.applySpecial("player", "shuffle", { actorCardId: "attack", opponentCardId: "king" });
    assert.equal(game.score(target), rank === "A" ? 21 : 30);
    assert.equal(game.stood[target], true);
    assert.equal(game.autoStood[target], true);
  }
});

test("skills that do not change the target's hand preserve manual STAND", () => {
  for (const skill of ["double", "triple", "lock", "shield", "peek", "extraDraw"]) {
    const { game, target } = attackGame("player", skill);
    assert.equal(game.applySpecial("player", skill).ok, true);
    game.refreshAutoStand();
    assert.equal(game.score(target), 20);
    assert.equal(game.stood[target], true);
    assert.equal(game.autoStood[target], false);
  }
});

test("an invalid swap leaves the target's STAND intact", () => {
  const { game, target } = attackGame("player", "shuffle");
  assert.equal(game.applySpecial("player", "shuffle", { actorCardId: "missing", opponentCardId: "king" }).ok, false);
  assert.equal(game.stood[target], true);
});
