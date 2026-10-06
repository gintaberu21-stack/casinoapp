import test from "node:test";
import assert from "node:assert/strict";
import { dealSpecials, RANK_WEIGHTS } from "../dist/js/skills.js";

test("A rank has a 10% weight and the remaining weight is split evenly", () => {
  assert.deepEqual(RANK_WEIGHTS, { A: 0.1, B: 0.45, C: 0.45 });
});

for (const [roll, rank] of [[0.05, "A"], [0.15, "B"], [0.6, "C"]]) {
  test(`the same rank roll ${roll} selects ${rank} for both player and CPU`, (t) => {
    let call = 0;
    t.mock.method(Math, "random", () => call++ % 2 === 0 ? roll : 0);
    const hands = dealSpecials();
    assert.equal(hands.player[0].rank, rank);
    assert.equal(hands.dealer[0].rank, rank);
    assert.equal(new Set([...hands.player, ...hands.dealer].map(s => s.id)).size, 6);
  });
}
