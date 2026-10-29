import { inventoryValue } from "./game.js";

export function localWinRate(stats) {
  const matches = Math.max(0, Number(stats?.matches) || 0);
  const wins = Math.max(0, Number(stats?.wins) || 0);
  return matches ? `${Math.min(100, wins / matches * 100).toFixed(1).replace(/\.0$/, "")}%` : "0%";
}

const key = () =>
  `casinoDuel.gameRecords.${localStorage.getItem("casinoDuel.accountToken") ?? "guest"}`;
export function readGameRecords() {
  try {
    return JSON.parse(localStorage.getItem(key())) ?? {};
  } catch {
    return {};
  }
}
export function recordGame(game, delta, id, payout = Math.max(0, delta)) {
  const records = readGameRecords();
  const stats = { matches: 0, wins: 0, losses: 0, draws: 0, net: 0, ids: [], ...records[game] };
  if (id && stats.ids.includes(id)) return;
  stats.matches++;
  stats[delta > 0 ? "wins" : delta < 0 ? "losses" : "draws"]++;
  stats.net += delta;
  stats.gained = (stats.gained ?? 0) + Math.max(0, Number(payout) || 0);
  if (id) stats.ids = [...stats.ids, id];
  records[game] = stats;
  localStorage.setItem(key(), JSON.stringify(records));
}
export function recordChipGain(game, amount, id) {
  const records = readGameRecords();
  const stats = records[game] ?? { gained: 0, ids: [] };
  if (stats.ids.includes(id)) return;
  stats.gained = (stats.gained ?? 0) + Math.max(0, Number(amount) || 0);
  stats.ids.push(id);
  records[game] = stats;
  localStorage.setItem(key(), JSON.stringify(records));
}

export function recordBlackjackRound(result, id) {
  if (!result) return;
  recordChipGain("blackjack", inventoryValue(result.returns?.player), id);
}

export function recordBlackjackMatch(result, id) {
  if (!result?.matchComplete) return;
  const outcome = result.matchOutcome;
  if (!["win", "loss", "draw"].includes(outcome)) return;
  const records = readGameRecords();
  const stats = { matches: 0, wins: 0, losses: 0, draws: 0, ids: [], ...records.blackjack };
  const matchId = `match:${id}`;
  if (stats.ids.includes(matchId)) return;
  stats.matches++;
  stats[outcome === "win" ? "wins" : outcome === "loss" ? "losses" : "draws"]++;
  stats.ids.push(matchId);
  records.blackjack = stats;
  localStorage.setItem(key(), JSON.stringify(records));
}
