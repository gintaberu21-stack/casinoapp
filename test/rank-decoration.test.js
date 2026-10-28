import test from "node:test";
import assert from "node:assert/strict";
import { RankSnapshot } from "../dist/js/rank-decoration.js";
import { CasinoDuelGame } from "../dist/js/game.js";
test("live rankings change while decoration stays frozen until the game ends",()=>{
  const ranks=new RankSnapshot();
  ranks.update([{playerId:1,rank:1},{playerId:2,rank:3}]);ranks.lock();
  ranks.update([{playerId:1,rank:4},{playerId:2,rank:1}]);
  assert.equal(ranks.current.get(1),4);
  assert.equal(ranks.rank(1),1);assert.equal(ranks.rank(2),3);
  ranks.lock();assert.equal(ranks.rank(1),1);
  ranks.unlock();assert.equal(ranks.rank(1),0);assert.equal(ranks.rank(2),1);
  ranks.lock();ranks.update([{playerId:1,rank:2}]);
  assert.equal(ranks.rank(1),0);ranks.unlock();assert.equal(ranks.rank(1),2);
});
test("guest snapshot preserves the frozen frame for each player's identity",()=>{
  const game=new CasinoDuelGame();game.startMatch();
  game.avatarRanks={player:1,dealer:3};game.avatarPlayerIds={player:10,dealer:20};
  const guest=new CasinoDuelGame();guest.restore(game.snapshot({swapSeats:true}));
  assert.deepEqual(guest.avatarRanks,{player:3,dealer:1});
  assert.deepEqual(guest.avatarPlayerIds,{player:20,dealer:10});
  game.startRound("player");assert.deepEqual(game.avatarRanks,{player:1,dealer:3});
});