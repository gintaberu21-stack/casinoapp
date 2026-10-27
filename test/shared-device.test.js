import test from "node:test";
import assert from "node:assert/strict";
import { GameUI } from "../dist/js/ui.js";
class Element {
  constructor() { this.children = []; this.parts = {}; this.events = {}; this.classList = { toggle() {} }; }
  replaceChildren(...children) { this.children = children; }
  querySelector(name) { return this.parts[name] ??= new Element(); }
  addEventListener(name, callback) { this.events[name] = callback; }
}
function setup() {
  const ui = Object.create(GameUI.prototype);
  const ids = ["my-chip-label", "rival-chip-label", "player-win-payout", "special-list", "next-card-preview", "handoff-overlay", "dealer-ready", "hit-button", "stand-button", "round-status", "dealer-kicker", "game-turn-label"];
  for (const actor of ["player", "dealer"])
    for (const suffix of ["hand", "hand-name", "score", "chip-count", "chip-stack", "debt-count", "bet-stack"]) ids.push(`${actor}-${suffix}`);
  ui.els = Object.fromEntries(ids.map(id => [id, new Element()]));
  ui.createCard = (card, options) => ({ id: card.id, hidden: options.hidden });
  ui.renderChipCollection = (node, inventory) => { node.inventory = inventory; };
  ui.renderSpecials = () => {};
  const game = { mode: "duo", actor: "player", dealerRevealed: false,
    names: { player: "PLAYER 1", dealer: "PLAYER 2" },
    player: [{ id: "p1" }, { id: "p2" }], dealer: [{ id: "d1" }, { id: "d2" }],
    score: actor => actor === "player" ? 18 : 20,
    chips: { player: 1000, dealer: 2000 }, inventories: { player: { red: 10 }, dealer: { black: 2 } },
    debts: {}, bets: { player: { chips: {}, amount: 100 }, dealer: { chips: {}, amount: 100 } },
    winPayoutFor: () => 200 };
  ui.currentNames = game.names;
  return { ui, game };
}

test("shared device ready switches the lower hand and keeps the opponent private", async () => {
  const { ui, game } = setup();
  const physical = { ...ui.els };
  ui.setPerspective(game);
  ui.renderHands(game);
  assert.ok(physical["player-hand"].children.every(card => !card.hidden));
  assert.ok(physical["dealer-hand"].children.every(card => card.hidden));
  assert.equal(physical["dealer-score"].textContent, "?");
  game.actor = "dealer";
  const pending = ui.requestHandoff("dealer", game);
  assert.ok(physical["player-hand"].children.every(card => card.hidden));
  assert.ok(physical["dealer-hand"].children.every(card => card.hidden));
  physical["dealer-ready"].events.click();
  await pending;
  assert.deepEqual(physical["player-hand"].children.map(card => card.id), ["d1", "d2"]);
  assert.ok(physical["player-hand"].children.every(card => !card.hidden));
  assert.ok(physical["dealer-hand"].children.every(card => card.hidden));
  assert.equal(physical["player-score"].textContent, 20);
  assert.equal(physical["dealer-score"].textContent, "?");
  assert.equal(physical["player-chip-count"].textContent, 2000);
  assert.equal(physical["my-chip-label"].textContent, "PLAYER 2");
  globalThis.document = { body: { dataset: { mode: "duo" } } };
  ui.setActions(true, "dealer");
  assert.equal(physical["game-turn-label"].textContent, "PLAYER 2 のターン");
  assert.equal(physical["game-turn-label"].hidden, false);
  game.actor = "player";
  ui.setPerspective(game);
  ui.renderHands(game);
  assert.deepEqual(physical["player-hand"].children.map(card => card.id), ["p1", "p2"]);
  assert.ok(physical["dealer-hand"].children.every(card => card.hidden));
});

test("showdown reveals both hands and solo restores the normal perspective", async () => {
  const { ui, game } = setup();
  ui.cue = () => {};
  game.actor = "dealer";
  ui.setPerspective(game);
  await ui.revealDealer(game);
  assert.ok(ui.els["player-hand"].children.every(card => !card.hidden));
  assert.ok(ui.els["dealer-hand"].children.every(card => !card.hidden));
  game.mode = "solo";
  game.dealerRevealed = false;
  ui.setPerspective(game);
  assert.equal(ui.viewActor, "player");
  assert.equal(ui.cardIsHidden(game, "player", 1), false);
  assert.equal(ui.cardIsHidden(game, "dealer", 0), false);
  assert.equal(ui.cardIsHidden(game, "dealer", 1), true);
});
