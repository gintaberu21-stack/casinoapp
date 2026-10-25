export class ButtonSample {
  constructor(board) {
    this.board = board;
    this.encoded = fetch(new URL("../audio/button-confirm.mp3", import.meta.url))
      .then((response) => response.ok ? response.arrayBuffer() : null).catch(() => null);
  }
  prime() {
    const context = this.board.ensure();
    if (!context) return Promise.resolve(null);
    this.decoded ??= this.encoded.then((bytes) => bytes ? context.decodeAudioData(bytes) : null)
      .catch(() => null);
    return this.decoded;
  }
  async play() {
    try {
      const buffer = await this.prime();
      if (!buffer) { this.board.play("press"); return; }
      const source = this.board.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.board.master);
      await new Promise((resolve) => {
        source.onended = () => { source.disconnect(); resolve(); };
        source.start();
      });
    } catch { /* Unavailable audio must never block a button or navigation. */ }
  }
}
