const CUES = {
  // ボタン全般。カチッと短く鳴らす。
  press: (board) => board.click({ freq: 1750, gain: 0.5 }),
  select: (board) => {
    board.click({ freq: 2300, gain: 0.42 });
    board.tone({ freq: 1180, to: 1760, duration: 0.09, type: "sine", gain: 0.1, delay: 0.03 });
  },
  // カードを配る。シュッと空気を切る音。
  deal: (board) => {
    board.noise({ duration: 0.26, from: 620, to: 5600, gain: 0.46, q: 0.85, attack: 0.42 });
    board.noise({ duration: 0.13, from: 4600, to: 1500, gain: 0.2, q: 1.1, delay: 0.19 });
  },
  // 伏せカードをめくる。シュッのあとに紙のパチッ。
  flip: (board) => {
    board.noise({ duration: 0.2, from: 900, to: 4800, gain: 0.38, q: 0.9, attack: 0.4 });
    board.click({ freq: 2050, gain: 0.32, delay: 0.17 });
  },
  chip: (board) => [0, 0.07, 0.14].forEach((delay, index) => {
    board.bell({ freq: 2100 + index * 340, duration: 0.3, gain: 0.12, delay });
  }),
  // コイントス。指で弾く金属音 → 空中 → 着地のチャリン。
  coin: (board) => {
    board.bell({ freq: 2480, duration: 0.85, gain: 0.2 });
    board.noise({ duration: 0.07, from: 6000, to: 2600, gain: 0.14, q: 1.2 });
    board.bell({ freq: 3260, duration: 0.6, gain: 0.1, delay: 0.04 });
    board.bell({ freq: 2150, duration: 0.55, gain: 0.17, delay: 1.1 });
    board.bell({ freq: 2820, duration: 0.45, gain: 0.12, delay: 1.22 });
    board.bell({ freq: 1960, duration: 0.4, gain: 0.08, delay: 1.31 });
  },
  // 必殺技。魔法陣が光るような上昇ときらめき。
  special: (board) => {
    board.tone({ freq: 210, to: 2600, duration: 1.05, type: "triangle", gain: 0.1 });
    board.noise({ duration: 1.25, from: 800, to: 7200, gain: 0.11, q: 1.5, attack: 0.55 });
    [784, 1046.5, 1318.5, 1568, 2093].forEach((freq, index) => {
      board.tone({ freq, duration: 0.95, type: "sine", gain: 0.13, delay: index * 0.085 });
      board.tone({ freq: freq * 2.01, duration: 0.7, type: "sine", gain: 0.05, delay: index * 0.085 });
    });
    for (let index = 0; index < 8; index += 1) {
      board.bell({ freq: 1900 + Math.random() * 2800, duration: 0.5, gain: 0.06, delay: 0.42 + index * 0.075 });
    }
  },
  // 必殺技の対象になったカード。小さめのきらめき。
  target: (board) => {
    board.bell({ freq: 2640, duration: 0.55, gain: 0.12 });
    board.bell({ freq: 3520, duration: 0.45, gain: 0.08, delay: 0.14 });
    board.noise({ duration: 0.5, from: 1600, to: 6200, gain: 0.07, q: 1.6, attack: 0.5 });
  },
  // 対戦の申し込みが届いたときの呼び出し音。
  notify: (board) => [0, 0.16].forEach((delay) => board.bell({ freq: 1568, duration: 0.5, gain: 0.16, delay })),
  win: (board) => [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
    board.tone({ freq, duration: 0.36, type: "triangle", gain: 0.22, delay: index * 0.12 });
  }),
  blackjack: (board) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, index) => {
      board.tone({ freq, duration: 0.42, type: "triangle", gain: 0.22, delay: index * 0.1 });
      board.tone({ freq: freq / 2, duration: 0.42, type: "sine", gain: 0.1, delay: index * 0.1 });
    });
    board.noise({ duration: 0.9, from: 1200, to: 6000, gain: 0.12, q: 0.6, delay: 0.1, attack: 0.2 });
  },
  // 負け。短調で下りて、最後は力なく音程が落ちる。
  loss: (board) => {
    [392, 329.63, 261.63].forEach((freq, index) => {
      board.tone({ freq, duration: 0.44, type: "triangle", gain: 0.19, delay: index * 0.23 });
      board.tone({ freq: freq / 2, duration: 0.44, type: "sine", gain: 0.09, delay: index * 0.23 });
    });
    board.tone({ freq: 233.08, to: 138.59, duration: 1.15, type: "sawtooth", gain: 0.15, delay: 0.69 });
    board.tone({ freq: 116.54, to: 69.3, duration: 1.15, type: "sine", gain: 0.12, delay: 0.69 });
  },
  draw: (board) => [523.25, 523.25].forEach((freq, index) => {
    board.tone({ freq, duration: 0.24, type: "sine", gain: 0.17, delay: index * 0.26 });
  }),
};

export class SoundBoard {
  constructor() {
    this.context = null;
    this.master = null;
  }

  ensure() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    return this.context;
  }

  tone({ freq, to = freq, duration = 0.2, type = "triangle", gain = 0.2, delay = 0 }) {
    const context = this.ensure();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const amp = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (to !== freq) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(amp).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  /** 金属的な響き。倍音を少しずらして鐘やコインらしくする。 */
  bell({ freq, duration = 0.6, gain = 0.15, delay = 0 }) {
    [1, 2.02, 3.01, 4.23].forEach((ratio, index) => {
      this.tone({ freq: freq * ratio, duration: duration / (1 + index * 0.6), type: "sine", gain: gain / (index + 1.3), delay });
    });
  }

  /** カチッ。ごく短いノイズと減衰する打点。 */
  click({ freq = 1800, gain = 0.3, delay = 0 }) {
    this.noise({ duration: 0.035, from: freq * 2.2, to: freq, gain, q: 0.9, delay });
    this.tone({ freq, to: freq * 0.5, duration: 0.05, type: "square", gain: gain * 0.45, delay });
  }

  noise({ duration = 0.2, from = 2600, to = 800, gain = 0.25, q = 1, delay = 0, attack = 0.02 }) {
    const context = this.ensure();
    if (!context) return;
    const start = context.currentTime + delay;
    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    const amp = context.createGain();
    const peak = start + Math.max(0.004, duration * attack);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, peak);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(amp).connect(this.master);
    source.start(start);
  }

  play(name) {
    const cue = CUES[name];
    if (!cue) return;
    try { cue(this); } catch { /* 音が出せない端末では無音のまま進める */ }
  }
}

export function installSoundBoard() {
  const board = new SoundBoard();
  window.addEventListener("casino:cue", (event) => board.play(event.detail?.name));
  ["pointerdown", "keydown"].forEach((type) => window.addEventListener(type, () => board.ensure(), { passive: true }));
  return board;
}
