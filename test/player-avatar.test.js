import test from "node:test";
import assert from "node:assert/strict";
import { CasinoDuelGame } from "../dist/js/game.js";
import { GameUI } from "../dist/js/ui.js";

test("avatars follow the correct player in guest snapshots and reset for a new match", () => {
  const game = new CasinoDuelGame();
  game.startMatch({player:{name:"A",avatar:"photo-a"},dealer:{name:"B",avatar:"photo-b"}});
  const guest = new CasinoDuelGame();
  guest.restore(game.snapshot({swapSeats:true}));
  assert.deepEqual(guest.avatars,{player:"photo-b",dealer:"photo-a"});
  game.startMatch({player:{name:"C"}});
  assert.deepEqual(game.avatars,{player:null,dealer:null});
});

test("player labels use the saved JPEG or a default SVG without duplicating icons", () => {
  class Node {
    constructor(){this.children=[];}
    setAttribute(){}
    append(node){this.children.push(node);}
    prepend(node){this.children.unshift(node);node.parent=this;}
    querySelector(){return this.children.find(n=>n.className==="hand-player-avatar")??null;}
    remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  }
  const previous=globalThis.document;
  globalThis.document={createElement:()=>new Node()};
  try {
    const ui=Object.create(GameUI.prototype);
    ui.els={"player-hand-name":new Node(),"dealer-hand-name":new Node()};
    const game={mode:"online",avatars:{player:"data:image/jpeg;base64,/9j/2Q==",dealer:null}};
    ui.renderPlayerAvatars(game);
    ui.renderPlayerAvatars(game);
    const own=ui.els["player-hand-name"].children;
    assert.equal(own.length,1);
    assert.equal(own[0].children[0].src,game.avatars.player);
    assert.match(ui.els["dealer-hand-name"].children[0].innerHTML,/<svg/);
  } finally {globalThis.document=previous;}
});