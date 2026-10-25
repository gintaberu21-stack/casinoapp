import { SoundBoard } from "./sound.js";

export class SlotSound {
  constructor() {
    this.board = new SoundBoard();
    this.reels = new Set();
    this.cues = new Set();
    window.addEventListener("pagehide", () => this.stopAll());
  }
  unlock() { try { this.board.ensure(); } catch {} }

  start() {
    this.stopAll();
    try {
      const ctx = this.board.ensure();
      if (!ctx) return;
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let filtered = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        filtered += .12 * (Math.random() * 2 - 1 - filtered);
        const tooth = Math.exp(-((t * 20) % 1) * 12);
        const edge = Math.min(1, i / 180, (data.length - 1 - i) / 180);
        data[i] = edge * (.2 * filtered + .055 * Math.sin(2 * Math.PI * 100 * t) +
          .1 * tooth * Math.sin(2 * Math.PI * 1200 * t));
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain).connect(this.board.master);
      this.motor = { source, gain };
      this.reels = new Set([0, 1, 2]);
      gain.gain.setValueAtTime(.8, ctx.currentTime);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { this.stopAll(); }
  }

  stopReel(reel) {
    if (!this.reels.delete(reel)) return;
    try {
      const ctx = this.board.context;
      if (this.motor) {
        this.motor.gain.gain.setTargetAtTime(.8 * this.reels.size / 3, ctx.currentTime, .025);
        if (!this.reels.size) {
          this.motor.source.stop(ctx.currentTime + .08);
          this.motor = null;
        }
      }
      // A hard mechanical latch and a short descending electronic stop cue.
      this.board.noise({ duration: .045, from: 2800, to: 700, gain: .34, q: .8 });
      this.tone(880 + reel * 110, .12, 0, .24, "square", 440 + reel * 55);
    } catch { /* Keep STOP responsive even without audio support. */ }
  }

  win(payout, bet) {
    if (!(payout > 0)) return;
    const big = payout >= bet * 40;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568] : [659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((note, index) => {
      this.tone(note, big ? .5 : .32, index * .105, .2, "triangle");
      this.tone(note / 2, .25, index * .105, .08, "sine");
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((note) =>
      this.tone(note, big ? 1.2 : .7, notes.length * .105, .075, "sine"));
  }

  tone(freq, duration, delay, volume, type, end = freq) {
    try {
      const ctx = this.board.ensure();
      if (!ctx) return;
      const source = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + delay;
      source.type = type;
      source.frequency.setValueAtTime(freq, start);
      source.frequency.exponentialRampToValueAtTime(end, start + duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      source.connect(gain).connect(this.board.master);
      this.cues.add(source);
      source.onended = () => { this.cues.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(start); source.stop(start + duration + .02);
    } catch {}
  }

  stopAll() {
    this.reels.clear();
    if (this.motor) {
      try { this.motor.source.stop(); } catch {}
      this.motor = null;
    }
    for (const source of this.cues) { try { source.stop(); } catch {} }
    this.cues.clear();
  }
}
