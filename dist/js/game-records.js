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
  const stats = records[game] ?? { matches: 0, wins: 0, losses: 0, draws: 0, net: 0, ids: [] };
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
