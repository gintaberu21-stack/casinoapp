const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Keep the source point under the fingers in place while panning and zooming.
export function gestureCrop(start, from, to, scale, displaySize) {
  const zoom = clamp(start.zoom * scale, 1, 3);
  const oldSize = Math.min(start.width, start.height) / start.zoom;
  const size = Math.min(start.width, start.height) / zoom;
  function offset(length, position, before, after) {
    const source = (length - oldSize) * (position + 100) / 200
      + before / displaySize * oldSize - after / displaySize * size;
    return length === size ? 0 : clamp(source / (length - size) * 200 - 100, -100, 100);
  }
  return { zoom, x: offset(start.width, start.x, from.x, to.x),
    y: offset(start.height, start.y, from.y, to.y) };
}

export function bindAvatarGestures(element, { enabled, read, write }) {
  const pointers = new Map();
  let baseline = null, suppressClick = false;
  function points() {
    const pair = [...pointers.values()].slice(0, 2);
    const rect = element.getBoundingClientRect();
    return { center: {
      x: pair.reduce((sum, p) => sum + p.x, 0) / pair.length - rect.left,
      y: pair.reduce((sum, p) => sum + p.y, 0) / pair.length - rect.top,
    }, distance: pair.length === 2 ? Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y) : 0,
    size: rect.width };
  }
  function reset() {
    pointers.clear(); baseline = null; suppressClick = false;
  }
  element.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || !enabled()) { suppressClick = false; return; }
    if (!pointers.size) suppressClick = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) { event.preventDefault(); suppressClick = true; }
    element.setPointerCapture(event.pointerId);
    baseline = { ...points(), crop: read() };
  });
  element.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    if (!enabled()) { reset(); return; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = points();
    if (!suppressClick && Math.hypot(current.center.x - baseline.center.x,
      current.center.y - baseline.center.y) < 5) return;
    suppressClick = true;
    event.preventDefault();
    write(gestureCrop(baseline.crop, baseline.center, current.center,
      baseline.distance > 0 ? current.distance / baseline.distance : 1, baseline.size));
  });
  function end(event) {
    if (!pointers.delete(event.pointerId)) return;
    baseline = pointers.size && enabled() ? { ...points(), crop: read() } : null;
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    element.addEventListener(type, end);
  element.addEventListener("click", event => {
    // Suppress the click after a drag/pinch, but keep a normal tap usable.
    if (suppressClick && event.detail !== 0) {
      suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  return reset;
}
