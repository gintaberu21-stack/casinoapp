// Keep audio failures independent of the server-authoritative spin result.
export class RouletteSpinSound {
  constructor() {
    this.context = null;
    this.source = null;
    this.generation = 0;
    this.encoded = fetch(new URL("../audio/roulette-spin.mp3", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error("Spin audio unavailable");
        return response.arrayBuffer();
      }).catch(() => null);
    window.addEventListener("pagehide", () => this.stop());
  }

  unlock() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ??= new Context();
      void this.context.resume().catch(() => {});
      this.decoded ??= this.encoded.then((bytes) => bytes
        ? this.context.decodeAudioData(bytes) : null).catch(() => null);
    } catch { /* The game can still run when audio is unavailable. */ }
  }

  async play(durationMs, startedAt) {
    this.stop();
    const generation = this.generation;
    const buffer = await this.decoded;
    if (!buffer || generation !== this.generation || this.context.state !== "running") return;
    const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
    const duration = durationMs / 1000;
    if (elapsed >= duration) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = buffer.duration / duration;
    source.connect(gain).connect(this.context.destination);
    const now = this.context.currentTime;
    const remaining = duration - elapsed;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.65, now + Math.min(.03, remaining / 3));
    gain.gain.setValueAtTime(0.65, now + Math.max(remaining / 3, remaining - .2));
    gain.gain.linearRampToValueAtTime(0, now + remaining);
    this.source = source;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (this.source === source) this.source = null;
    };
    source.start(now, elapsed * source.playbackRate.value);
    source.stop(now + remaining);
  }

  stop() {
    this.generation += 1;
    if (this.source) {
      try { this.source.stop(); } catch { /* Already stopped. */ }
      this.source = null;
    }
  }
}
