import test from "node:test";
import assert from "node:assert/strict";
import { gestureCrop, bindAvatarGestures } from "../dist/js/avatar-gestures.js";

test("pinch preserves its source anchor and pan follows the finger within image bounds", () => {
  const start = { width: 1000, height: 1000, zoom: 1, x: 0, y: 0 };
  const crop = gestureCrop(start, {x: 40, y: 40}, {x: 40, y: 40}, 2, 150);
  assert.equal(crop.zoom, 2);
  const sourceX = (1000 - 500) * (crop.x + 100) / 200 + 40 / 150 * 500;
  assert.ok(Math.abs(sourceX - 40 / 150 * 1000) < 0.00001);
  const dragged = gestureCrop({...start, ...crop}, {x: 40, y: 40}, {x: 60, y: 40}, 1, 150);
  assert.ok(dragged.x < crop.x);
  const edge = gestureCrop(start, {x: 75, y: 75}, {x: -10000, y: 10000}, 10, 150);
  assert.deepEqual(edge, {zoom: 3, x: 100, y: -100});
  assert.deepEqual(gestureCrop(start, {x: 75,y: 75}, {x: 0,y: 0}, 0.1, 150),
    {zoom: 1, x: 0, y: 0});
});

test("touch transitions from pinch to pan without jumping; mouse keeps its existing behavior", () => {
  const listeners = new Map();
  const element = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    getBoundingClientRect() { return {left: 0, top: 0, width: 150}; },
    setPointerCapture() {},
  };
  let active = true, writes = 0;
  let state = {width: 1000, height: 1000, zoom: 1, x: 0, y: 0};
  const reset = bindAvatarGestures(element, { enabled: () => active, read: () => state,
    write: crop => { state = {...state, ...crop}; writes++; } });
  function emit(type, id, x, pointerType = "touch") {
    let prevented = false;
    listeners.get(type)({pointerId: id, clientX: x, clientY: 75, pointerType,
      preventDefault() { prevented = true; }});
    return prevented;
  }
  assert.equal(emit("pointerdown", 0, 50, "mouse"), false);
  emit("pointermove", 0, 60, "mouse"); assert.equal(writes, 0);
  emit("pointerdown", 1, 50); emit("pointerdown", 2, 100);
  emit("pointermove", 2, 150); assert.equal(state.zoom, 2);
  emit("pointerup", 2, 150);
  const afterPinch = {...state};
  emit("pointermove", 1, 50);
  assert.ok(Math.abs(state.x - afterPinch.x) < 0.000001);
  assert.equal(state.y, afterPinch.y); assert.equal(state.zoom, afterPinch.zoom);
  emit("pointermove", 1, 60); assert.ok(state.x < afterPinch.x);
  emit("pointercancel", 1, 60);
  const before = writes; emit("pointermove", 1, 70); assert.equal(writes, before);
  active = false; assert.equal(emit("pointerdown", 3, 50), false);
  active = true; emit("pointerdown", 3, 50); reset();
  emit("pointermove", 3, 80); assert.equal(writes, before);
});
