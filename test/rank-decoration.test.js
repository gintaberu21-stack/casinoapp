import test from "node:test";
import assert from "node:assert/strict";
import { RankSnapshot } from "../dist/js/rank-decoration.js";
import { CasinoDuelGame } from "../dist/js/game.js";
import { decorateRank } from "../dist/js/rank-decoration.js";

test("wallet and profile rank changes preserve content and remove ornament outside the top three", () => {
  for (const id of ["lobby-wallet", "account-profile-dialog"]) {
    const classes = new Set();
    const node = { id, dataset: {}, textContent: "PLAYER 128,500 CHIP",
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
    for (const rank of [1, 2, 3, 4, 0, 2]) {
      decorateRank(node, rank);
      assert.equal(node.dataset.rank, rank >= 1 && rank <= 3 ? String(rank) : "0");
      assert.equal(classes.has("rank-panel"), rank >= 1 && rank <= 3);
      assert.equal(node.textContent, "PLAYER 128,500 CHIP");
    }
  }
});
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
test("three image frames stay mounted; changing rank only changes hidden flags", async()=>{
 const {decorateRank}=await import("../dist/js/rank-decoration.js");
 class Element {
  constructor(){this.children=[];this.dataset={};this.classList={add(){},toggle(){}};}
  append(node){this.children.push(node);}
  setAttribute(){}
  querySelector(){return this.children.find(n=>n.className==="rank-laurel")??null;}
  querySelectorAll(){return this.children.filter(n=>n.className==="rank-frame-image");}
 }
 const previous=globalThis.document;
 globalThis.document={createElement:()=>new Element()};
 try {
  const icon=new Element(),photo=new Element(); photo.src="original-photo";icon.append(photo);
  decorateRank(icon,0);const layer=icon.querySelector(),frames=layer.children;
  assert.equal(frames.length,3);assert.ok(frames.every(f=>f.hidden));
  decorateRank(icon,2);assert.deepEqual(frames.map(f=>f.hidden),[true,false,true]);
  decorateRank(icon,1);assert.deepEqual(frames.map(f=>f.hidden),[false,true,true]);
  decorateRank(icon,4);assert.ok(frames.every(f=>f.hidden));
  assert.equal(icon.children[0],photo);assert.equal(photo.src,"original-photo");
  assert.equal(icon.querySelector(),layer);assert.equal(layer.children.length,3);
 }finally{globalThis.document=previous;}
});
