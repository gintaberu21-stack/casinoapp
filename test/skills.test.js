import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame } from "../dist/js/game.js";
import { GameUI } from "../dist/js/ui.js";
import { getSpecial, SPECIALS } from "../dist/js/skills.js";

for (const [mode, actor, viewerActor, ownCardsRevealed] of [
  ["online", "player", "player", false],
  ["online", "dealer", "dealer", true],
  ["solo", "dealer", "dealer", true],
  ["duo", "dealer", "dealer", false],
]) {
  test(`ARCANA EYE uses the viewer's perspective: ${mode}/${actor}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const classes = new Set();
    const list = {
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
      replaceChildren: (...cards) => { list.cards = cards; },
    };
    const els = { "select-card-heading": {}, "select-card-list": list, "select-card-overlay": { hidden: true } };
    const ui = { els, createSpecialCard: (skill, disabled) => ({ skill, disabled }) };
    const skills = [getSpecial("lock")];
    const reveal = GameUI.prototype.showOpponentSpecialCards.call(ui, skills, { mode, actor: viewerActor }, actor);
    assert.equal(els["select-card-heading"].textContent, ownCardsRevealed ? "自分の必殺技カードが公開された" : "相手の必殺技カードを公開");
    assert.equal(els["select-card-overlay"].hidden, false);
    assert.deepEqual(list.cards, [{ skill: skills[0], disabled: true }]);
    t.mock.timers.tick(2800);
    await reveal;
    assert.equal(els["select-card-overlay"].hidden, true);
    assert.equal(classes.size, 0);
  });
}

test("FUTURE SIGHT reserves a card for its owner across the opponent's draw and seat swap", () => {
  const game = new CasinoDuelGame();
  game.phase = "playing";
  game.skills.player = [getSpecial("peek")];
  game.deck = [{ id: "other", rank: "3" }, { id: "reserved", rank: "7" }];
  assert.equal(game.applySpecial("player", "peek").ok, true);
  assert.equal(game.reservedCard.player.id, "reserved");
  assert.equal(game.snapshot({ swapSeats: true }).reservedCard.dealer.id, "reserved");
  assert.equal(game.drawCard("dealer").id, "other");
  assert.equal(game.drawCard("player").id, "reserved");
  assert.equal(game.reservedCard.player, null);
});

test("LOCK prevents skill use without consuming the locked player's card", () => {
  const game = new CasinoDuelGame();
  game.phase = "playing";
  game.skills.player = [getSpecial("lock")];
  game.skills.dealer = [getSpecial("double")];
  assert.equal(game.applySpecial("player", "lock").ok, true);
  game.switchActor();
  assert.equal(game.snapshot({ swapSeats: true }).locked.player, true);
  assert.equal(game.applySpecial("dealer", "double").ok, false);
  assert.equal(game.skills.dealer.length, 1);
});

for (const special of SPECIALS) {
  for (const isAi of [false, true]) {
    test(`${special.name} shows its full announcement for ${isAi ? "CPU" : "player"}`, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const focus = { style: {}, offsetWidth: 300 };
      const els = Object.fromEntries(["actor", "icon", "title", "effect", "description"].map(key => [`special-focus-${key}`, {}]));
      els["special-focus-title"].closest = () => focus;
      els["special-overlay"] = { hidden: true, classList: { toggle() {} } };
      const cues = [];
      const ui = { els, cue: name => cues.push(name) };
      const announcement = GameUI.prototype.showSpecial.call(ui, special, "player", isAi);
      assert.equal(els["special-overlay"].hidden, false);
      assert.equal(els["special-focus-title"].textContent, special.name);
      assert.equal(els["special-focus-description"].textContent, special.description);
      assert.deepEqual(cues, ["special"]);
      const duration = isAi ? 2900 : 1900;
      t.mock.timers.tick(duration - 1);
      assert.equal(els["special-overlay"].hidden, false);
      t.mock.timers.tick(1);
      await announcement;
      assert.equal(els["special-overlay"].hidden, true);
    });
  }
}

test("NEXT CARD is hidden after STAND even if the same actor retains the turn", () => {
  const preview = { hidden: true, replaceChildren: card => { preview.card = card; } };
  const ui = { els: { "next-card-preview": preview }, createCard: card => ({ id: card.id, classList: { add() {} } }) };
  const game = new CasinoDuelGame();
  game.phase = "playing";
  game.reservedCard.player = { id: "next", rank: "9" };
  GameUI.prototype.showReservedCard.call(ui, game, "player");
  assert.equal(preview.hidden, false);
  assert.equal(preview.card.id, "next");
  game.stood.player = true;
  GameUI.prototype.showReservedCard.call(ui, game, "player");
  assert.equal(preview.hidden, true);
  assert.equal(game.reservedCard.player.id, "next");
  game.stood.player = false;
  game.phase = "settled";
  GameUI.prototype.showReservedCard.call(ui, game, "player");
  assert.equal(preview.hidden, true);
});
