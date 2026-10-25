import test from "node:test";
import assert from "node:assert/strict";
import { RouletteSpinSound } from "../dist/js/roulette-sound.js";

function setup(t, decode = async () => ({ duration: 10 })) {
  const sources = [];
  class Context {
    state = "running";
    currentTime = 5;
    destination = {};
    resume() { return Promise.resolve(); }
    decodeAudioData = decode;
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        connect: () => ({ connect() {} }), disconnect() {},
        start(...args) { this.started = args; },
        stop(...args) { (this.stops ??= []).push(args); },
      };
      sources.push(source);
      return source;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, disconnect() {} };
    }
  }
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
  const old = globalThis.window;
  globalThis.window = { AudioContext: Context, addEventListener() {} };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  return sources;
}

test("late audio loading seeks to the animation position and stops with the wheel", async (t) => {
  const sources = setup(t);
  const audio = new RouletteSpinSound();
  audio.unlock();
  await audio.play(10000, performance.now() - 2000);
  assert.equal(sources.length, 1);
  assert.ok(sources[0].started[1] >= 2 && sources[0].started[1] < 2.1);
  assert.ok(sources[0].stops[0][0] <= 13 && sources[0].stops[0][0] > 12.9);
  audio.stop();
  assert.equal(sources[0].stops.length, 2);
});

test("stopping while decode is pending prevents stale spin audio from starting", async (t) => {
  let finish;
  const decoded = new Promise((resolve) => { finish = resolve; });
  const sources = setup(t, () => decoded);
  const audio = new RouletteSpinSound();
  audio.unlock();
  const playing = audio.play(10000, performance.now());
  audio.stop();
  finish({ duration: 10 });
  await playing;
  assert.equal(sources.length, 0);
});

test("a missing audio file does not reject or prevent gameplay", async (t) => {
  const sources = setup(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  const audio = new RouletteSpinSound();
  audio.unlock();
  await audio.play(10000, performance.now());
  assert.equal(sources.length, 0);
});
