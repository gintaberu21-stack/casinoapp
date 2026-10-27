export const TURN_LIMIT_MS = 15000;
export const TURN_WARNING_MS = 5000;

export class TurnTimer {
  constructor({ now = () => Date.now(), schedule = setInterval, cancel = clearInterval } = {}) {
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.handle = null;
    this.version = 0;
  }
  stop() {
    this.version++;
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
  }
  start(deadline, { onTick, onTimeout }) {
    this.stop();
    const version = this.version;
    const tick = () => {
      if (version !== this.version) return;
      const remaining = Math.max(0, deadline - this.now());
      onTick?.(remaining);
      if (remaining === 0) {
        this.stop();
        onTimeout?.();
      }
    };
    this.handle = this.schedule(tick, 100);
    tick();
  }
}
