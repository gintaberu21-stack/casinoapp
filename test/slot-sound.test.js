import test from "node:test";
import assert from "node:assert/strict";
import { SlotSound } from "../dist/js/slot-sound.js";

function makeSound(t) {
  const old = globalThis.window;
  globalThis.window = { addEventListener() {} };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  const sound = new SlotSound();
  const nodes = [];
  const param = () => ({ setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => {
    const result = { connect: () => ({ connect() {} }), disconnect() {}, start() {}, stops: 0,
      stop() { this.stops++; }, frequency: param() };
    nodes.push(result); return result;
  };
  const ctx = { currentTime: 1, sampleRate: 100, createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
    createBufferSource: node, createOscillator: node, createGain: () => ({ gain: param(), disconnect() {} }) };
  sound.board = { ensure: () => ctx, context: ctx, master: {}, noise() {} };
  return { sound, nodes };
}

test("slot motor fades with each distinct stopped reel and ends after all three", (t) => {
  const { sound, nodes } = makeSound(t);
  sound.start(); const motor = nodes[0];
  sound.stopReel(0); const count = nodes.length;
  sound.stopReel(0);
  assert.equal(nodes.length, count);
  assert.equal(sound.reels.size, 2);
  sound.stopReel(2); sound.stopReel(1);
  assert.equal(sound.motor, null);
  assert.equal(motor.stops, 1);
});

test("only winning payouts produce a fanfare and a new spin cancels it", (t) => {
  const { sound, nodes } = makeSound(t);
  sound.win(0, 100); assert.equal(nodes.length, 0);
  sound.win(500, 100); assert.ok(sound.cues.size > 0);
  const fanfare = [...sound.cues];
  sound.start();
  assert.equal(sound.cues.size, 0);
  assert.ok(fanfare.every((source) => source.stops === 2));
});

test("slot audio remains optional when Web Audio is unavailable", (t) => {
  const { sound } = makeSound(t);
  sound.board.ensure = () => null;
  assert.doesNotThrow(() => { sound.start(); sound.stopReel(0); sound.win(1000, 100); sound.stopAll(); });
});
