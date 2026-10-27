import { inventoryValue } from "../dist/js/game.js";

export async function recordBlackjackGains(store, hostId, peerId, payload) {
  if (!payload || typeof payload.id !== "string" ||
      !/^[\w:-]{20,120}$/.test(payload.id) ||
      !["win", "loss", "draw"].includes(payload.outcome)) return;
  for (const [actor, playerId] of [["player", hostId], ["dealer", peerId]]) {
    if (!playerId) continue;
    const account = await store.findAccountById(playerId);
    const stake = account?.pendingBet?.amount;
    if (account?.pendingBet?.gainRecorded) continue;
    if (!Number.isSafeInteger(stake) || stake <= 0) continue;
    const chips = payload.returns?.[actor];
    if (!chips || Array.isArray(chips) || Object.keys(chips).some(type => !["red", "blue", "black", "white"].includes(type)) || Object.values(chips).some(count => !Number.isSafeInteger(count) || count < 0)) continue;
    const amount = inventoryValue(chips);
    const lost = payload.outcome === (actor === "player" ? "loss" : "win");
    const maximum = lost ? 0 : payload.outcome === "draw" ? stake : stake * 18;
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > maximum) continue;
    await store.recordChipGain(playerId, amount, payload.id, "blackjack");
    await store.updateAccount(playerId, { pendingBet: { ...account.pendingBet, gainRecorded: true } });
  }
}
