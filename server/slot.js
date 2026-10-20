import crypto from "node:crypto";
import { valueToInventory } from "../dist/js/game.js";

const order = [
  "seven",
  "bell",
  "lemon",
  "cherry",
  "grape",
  "bar",
  "orange",
  "diamond",
  "watermelon",
  "star",
];
const pay = {
  seven: 100,
  bar: 40,
  diamond: 20,
  bell: 10,
  cherry: 5,
  lemon: 5,
  grape: 5,
  orange: 5,
  watermelon: 5,
  star: 10,
};
const mod = (n, d) => ((n % d) + d) % d;
export function stoppedIndex(round, reel, now) {
  const elapsed = Math.max(0, Math.min(30000, now - round.startedAt));
  return mod(Math.floor(round.initial[reel] - 1 - elapsed / 100) + 1, 30);
}
export function slotPayout(indices, bet) {
  const symbolAt = (reel, offset) => order[mod(indices[reel] + [0, 2, 4][reel] + offset, 10)];
  const lines = [
    [0, 0, 0],
    [-1, 0, 1],
    [1, 0, -1],
  ];
  let multiplier = 0;
  lines.forEach((offsets, line) => {
    const symbols = offsets.map((offset, reel) => symbolAt(reel, offset));
    if (symbols.every((symbol) => symbol === symbols[0])) multiplier += pay[symbols[0]];
    // The single-cherry bonus applies only to the center line.
    else if (line === 0 && symbols[0] === "cherry") multiplier += 2;
  });
  return bet * multiplier;
}
export async function slotAction(store, account, action, body = {}, now = Date.now()) {
  let round = account.slotRound;
  if (action === "start") {
    if (round && !round.done) throw new Error("進行中のスピンを先に終了してください");
    if (![100, 200, 300, 400, 500].includes(body.bet) || account.chips < body.bet)
      throw new Error("チップが不足しているか、ベットが無効です");
    round = {
      id: crypto.randomUUID(),
      bet: body.bet,
      startedAt: now,
      initial: [0, 1, 2],
      indices: [null, null, null],
      done: false,
      win: 0,
    };
    account = await store.updateAccount(account.playerId, {
      chips: account.chips - body.bet,
      inventory: valueToInventory(account.chips - body.bet),
      slotRound: round,
    });
  } else if (action === "stop" || (action === "state" && round && !round.done)) {
    if (!round || (action === "stop" && body.roundId !== round.id))
      throw new Error("スピン情報が一致しません");
    round = structuredClone(round);
    if (action === "stop" && ![0, 1, 2].includes(body.reel)) throw new Error("リールが無効です");
    if (
      action === "stop" &&
      body.index !== undefined &&
      (!Number.isInteger(body.index) || body.index < 0 || body.index >= 30)
    ) throw new Error("停止位置が無効です");
    const reels = action === "state" ? [0, 1, 2] : [body.reel];
    for (const reel of reels)
      if (round.indices[reel] === null)
        round.indices[reel] = action === "stop" && body.index !== undefined
          ? body.index
          : stoppedIndex(round, reel, now);
    if (!round.done && round.indices.every((i) => i !== null)) {
      round.done = true;
      round.win = slotPayout(round.indices, round.bet);
      const chips = account.chips + round.win;
      account = await store.updateAccount(account.playerId, {
        chips,
        inventory: valueToInventory(chips),
        slotRound: round,
      });
    } else account = await store.updateAccount(account.playerId, { slotRound: round });
  }
  return { balance: account.chips, name: account.name, round: round ?? null };
}
