import test from 'node:test';
import assert from 'node:assert/strict';
import { playRound, drawNumber, rotationFor, ballRollTarget, ballRollFrame, WHEEL_ORDER, settleBets, drawPocket, betDefinition, INSIDE_BETS } from '../dist/js/roulette.js';
test('every guess/outcome and stake pays only matching numbers at 36x', () => {
  for (const stake of [10,50,100]) for (let choice=1;choice<=36;choice++) for(let number=1;number<=36;number++) {
    const result=playRound(1000,choice,stake,number);
    assert.equal(result.balance,1000-stake+(choice===number?stake*36:0));
    assert.equal(result.delta,result.balance-1000);
  }
});
test('rotation aligns all 36 segment centers with the top pointer, repeatedly',()=>{
  let current=0;
  for(let round=0;round<3;round++) for(let number=1;number<=36;number++) {
    const next=rotationFor(current,number);
    assert.ok(next-current>=3600);
    assert.equal((next+(number-.5)*10)%360,0);
    current=next;
  }
});
test('random draw rejects excess byte values and maps equally to 1..36',()=>{
  const counts=Array(36).fill(0);
  for(let byte=0;byte<252;byte++) counts[drawNumber(bytes=>{bytes[0]=byte;})-1]++;
  assert.deepEqual(counts,Array(36).fill(7));
  let calls=0;
  assert.equal(drawNumber(bytes=>{bytes[0]=calls++===0?255:7;}),8);
  assert.equal(calls,2);
});
test('insufficient balance and invalid inputs cannot start a round',()=>{
  for(const args of [[9,1,10,1],[100,0,10,1],[100,37,10,1],[100,1,20,1],[100,1,10,37],[-1,1,10,1]]) assert.throws(()=>playRound(...args));
  assert.equal(playRound(10,1,10,2).balance,0);
});
test('ball lands in the selected pocket across repeated spins',()=>{
  let wheel=0, ball=0;
  const mod=n=>((n%360)+360)%360;
  for(let round=0;round<4;round++) for(const number of WHEEL_ORDER) {
    const target=ballRollTarget(wheel,ball,number);
    const start=ballRollFrame(0,wheel,ball,target);
    const end=ballRollFrame(1,wheel,ball,target);
    assert.equal(start.radius,46);
    assert.equal(end.radius,33);
    assert.ok(Math.abs(mod(end.ball-end.wheel) - (WHEEL_ORDER.indexOf(number)+.5)*360/WHEEL_ORDER.length)<1e-8);
    assert.ok(target.ballEnd<ball-360*7);
    assert.ok(target.wheelEnd>wheel+360*4);
    assert.equal(ballRollFrame(.5,wheel,ball,target).radius,46);
    wheel=target.wheelEnd; ball=target.ballEnd;
  }
});
test('all 38 pockets are equally represented by the random draw',()=>{
  const counts=Array(38).fill(0);
  for(let byte=0;byte<228;byte++) counts[WHEEL_ORDER.indexOf(drawPocket(bytes=>{bytes[0]=byte;}))]++;
  assert.deepEqual(counts,Array(38).fill(6));
  assert.equal(new Set(WHEEL_ORDER).size,38);
});
test('outside bets cover their exact ranges and never include zero',()=>{
  for(const [id,count,multiplier] of [['red',18,2],['black',18,2],['even',18,2],['odd',18,2],['low',18,2],['high',18,2],['dozen:1',12,3],['dozen:2',12,3],['dozen:3',12,3],['column:1',12,3],['column:2',12,3],['column:3',12,3]]){
    const def=betDefinition(id);
    assert.equal(def.matches(0),false); assert.equal(def.matches("00"),false);
    assert.equal(Array.from({length:37},(_,n)=>n).filter(def.matches).length,count);
    assert.equal(def.multiplier,multiplier);
  }
});
test('overlapping wins sum their returns and zero only pays direct zero bets',()=>{
  const bets={'n:3':10,red:50,odd:10,'dozen:1':10,'column:3':10};
  const result=settleBets(1000,bets,3);
  assert.equal(result.total,90); assert.equal(result.payout,540); assert.equal(result.balance,1450);
  assert.equal(settleBets(1000,{...bets,'n:0':10},0).payout,360);
  assert.equal(settleBets(1000,bets,0).payout,0);
});
test('invalid or unaffordable combined bets are rejected',()=>{
  for(const bets of [{},{red:-10},{red:1},{unknown:10},{'n:37':10},{red:100,black:100}]) assert.throws(()=>settleBets(100,bets,1));
});

test('all inside combinations pay the correct return for every pocket',()=>{
 const expected={split:[2,18],street:[3,12],corner:[4,9],five:[5,7],line:[6,6]};
 for(const [kind,groups] of Object.entries(INSIDE_BETS)) {
  assert.ok(groups.length);
  for(const bet of groups){
   assert.equal(new Set(bet.numbers).size,expected[kind][0]);
   assert.equal(bet.multiplier,expected[kind][1]);
   for(const number of WHEEL_ORDER) assert.equal(settleBets(1000,{[bet.id]:10},number).payout,bet.numbers.includes(number)?10*bet.multiplier:0);
  }
 }
});
test('zero and double zero stay distinct and five-number wins combine',()=>{
 const bets={'n:0':10,'n:00':20,'five:0-00-1-2-3':10};
 assert.equal(settleBets(1000,bets,0).payout,430);
 assert.equal(settleBets(1000,bets,'00').payout,790);
 assert.equal(settleBets(1000,bets,3).payout,70);
 assert.equal(settleBets(1000,bets,4).payout,0);
 let calls=0;drawPocket(bytes=>{bytes[0]=calls++?0:255;});assert.equal(calls,2);
});
