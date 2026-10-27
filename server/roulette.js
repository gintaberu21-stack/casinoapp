import { randomInt } from "node:crypto";
import { WHEEL_ORDER, settleBets } from "../dist/js/roulette.js";
import { valueToInventory } from "../dist/js/game.js";

export async function rouletteAction(store, account, action, body = {}) {
  if (action === "state")
    return { balance: account.chips, name: account.name, result: account.rouletteRound ?? null };
  if (action !== "spin") throw new Error("操作が無効です");
  if (typeof body.requestId !== "string" || !/^[\w-]{20,80}$/.test(body.requestId))
    throw new Error("スピン情報が無効です");
  if (account.rouletteRound?.id === body.requestId) {
    await store.recordChipGain(account.playerId, account.rouletteRound.payout, body.requestId, "roulette");
    return { balance: account.chips, name: account.name, result: account.rouletteRound };
  }
  // Keep a small request ledger so an old retry cannot charge a second wager.
  if (account.rouletteRequests?.includes(body.requestId)) throw new Error("処理済みのスピンです");
  if (account.slotRound && !account.slotRound.done)
    throw new Error("スロットのスピンを終了してください");
  if (
    !body.bets ||
    Array.isArray(body.bets) ||
    typeof body.bets !== "object" ||
    Object.keys(body.bets).length > 200
  )
    throw new Error("ベットが無効です");
  for (const amount of Object.values(body.bets))
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 100)
      throw new Error("ベットは100チップ単位です");
  const result = {
    ...settleBets(account.chips, body.bets, WHEEL_ORDER[randomInt(WHEEL_ORDER.length)]),
    id: body.requestId,
  };
  const accountStats = account.rouletteStats ?? { matches: 0, wins: 0, losses: 0, draws: 0 };
  const rouletteStats = { ...accountStats, matches: accountStats.matches + 1 };
  rouletteStats[result.delta > 0 ? "wins" : result.delta < 0 ? "losses" : "draws"]++;
  await store.updateAccount(account.playerId, {
    chips: result.balance,
    inventory: valueToInventory(result.balance),
    rouletteRound: result,
    rouletteStats,
    rouletteRequests: [...(account.rouletteRequests ?? []), body.requestId],
  });
  await store.recordChipGain(account.playerId, result.payout, result.id, "roulette");
  return { balance: result.balance, name: account.name, result };
}
