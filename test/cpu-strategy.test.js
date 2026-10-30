import test from "node:test";
import assert from "node:assert/strict";
import { bestSwap } from "../dist/js/cpu-strategy.js";
import { CasinoDuelGame } from "../dist/js/game.js";
const hand = (prefix, ...ranks) => ranks.map((rank, i) => ({id: `${prefix}-${i}`, rank}));

test("CPU preserves 20 instead of exchanging for a weaker hand", () => {
  assert.equal(bestSwap(hand('cpu','K','Q'), hand('player','2','3')), null);
});
test("CPU chooses an advantageous exchange without busting its own hand", () => {
  const own = hand('cpu','10','6'), rival = hand('player','10','9');
  assert.deepEqual(bestSwap(own, rival), {actorCardId:'cpu-1', opponentCardId:'player-0'});
});
test("CPU declines to spend a shuffle card when no swap improves its position", () => {
  const game = new CasinoDuelGame();
  game.dealer = hand('cpu','K','Q'); game.player = hand('player','2','3');
  game.skills.dealer = [{id:'shuffle'}];
  assert.equal(game.chooseDealerSpecial(), null);
});
