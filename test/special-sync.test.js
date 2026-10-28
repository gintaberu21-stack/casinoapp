import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../dist/js/app.js",import.meta.url),"utf8");
const receive=source.slice(source.indexOf("async function receiveHostState("),source.indexOf("function bindDialogs("));
test("discard picker does not block subsequent turn snapshots or send a stale choice",async()=>{
  let resolveChoice;
  const actions=[];
  const els=new Proxy({}, {get:(o,k)=>o[k]??={}});
  const game={actor:"player",phase:"playing",chips:{},matchRound:1,restore(state){Object.assign(this,state);}};
  const context=vm.createContext({document:{body:{dataset:{}}},game,onlineRole:"guest",guestRenderedRound:1,guestChoiceVersion:0,busy:false,
    matchService:{sendAction:a=>actions.push(a)},watchGuestTimer(){},console,
    ui:{els,setNames(){},renderHands(){},renderSpecials(){},setActions(){},
      animateChipChange:async()=>{},chooseCards:()=>new Promise(r=>{resolveChoice=r;})}
  });
  vm.runInContext(receive,context);
  const fn=vm.runInContext("receiveHostState",context);
  await fn({event:"chooseDiscard",state:{actor:"player",phase:"playing",matchRound:1}});
  await fn({event:"turn",state:{actor:"dealer",phase:"playing",matchRound:1}});
  assert.equal(game.actor,"dealer");
  assert.equal(els["select-card-overlay"].hidden,true);
  resolveChoice("old-card");
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(actions,[]);
});
test("valid discard choice is sent once while incoming clock snapshots still work",async()=>{
  let choose;const actions=[];
  const context=vm.createContext({document:{body:{dataset:{}}},onlineRole:"guest",guestRenderedRound:1,guestChoiceVersion:0,busy:false,console,
    game:{actor:"player",phase:"playing",chips:{},matchRound:1,restore(s){Object.assign(this,s);}},watchGuestTimer(){},
    matchService:{sendAction:a=>actions.push(a)},ui:{els:new Proxy({}, {get:(o,k)=>o[k]??={}}),
      setNames(){},renderHands(){},renderSpecials(){},setActions(){},animateChipChange:async()=>{},
      chooseCards:()=>new Promise(r=>{choose=r;})}});
  vm.runInContext(receive,context);const fn=vm.runInContext("receiveHostState",context);
  await fn({event:"chooseDiscard",state:{actor:"player",phase:"playing",matchRound:1}});
  await fn({event:"turnClock",state:{actor:"player",phase:"playing",matchRound:1}});
  choose("card");await new Promise(r=>setImmediate(r));
  assert.equal(actions.length,1);assert.equal(actions[0].cardId,"card");
});