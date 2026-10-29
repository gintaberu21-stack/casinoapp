import { apiFetch } from "./backend.js";
export class RankSnapshot {
  constructor() { this.current = new Map(); this.frozen = null; }
  update(players) { this.current = new Map(players.map(p => [Number(p.playerId), Number(p.rank)])); }
  rank(id) { const rank = (this.frozen ?? this.current).get(Number(id)); return rank >= 1 && rank <= 3 ? rank : 0; }
  lock() { this.frozen ??= new Map(this.current); }
  unlock() { this.frozen = null; }
}
export const rankSnapshot = new RankSnapshot();
const targets = new Map();
export function decorateRank(node, rank) {
  if (node.id === "lobby-wallet" || node.id === "account-profile-dialog") {
    decorateRankPanel(node, rank);
    return;
  }
  node.classList.add("rank-avatar");
  node.classList.toggle("has-rank-laurel", [1,2,3].includes(rank));
  let frame = node.querySelector(".rank-laurel");
  if (!frame) {
    frame = document.createElement("span");
    frame.className = "rank-laurel";
    frame.setAttribute("aria-hidden", "true");
    for (const position of [1,2,3]) {
      const image = document.createElement("img");
      image.className = "rank-frame-image";
      image.dataset.rank = String(position);
      image.src = new URL(`../assets/rank-frames/rank-${position}.png`, import.meta.url).href;
      image.alt = "";
      image.hidden = true;
      image.draggable = false;
      frame.append(image);
    }
    node.append(frame);
  }
  for (const image of frame.querySelectorAll(".rank-frame-image"))
    image.hidden = Number(image.dataset.rank) !== rank;
}
// These surfaces keep their content and typography; CSS supplies only the frame.
export function decorateRankPanel(node, rank) {
  const position = [1, 2, 3].includes(rank) ? String(rank) : "0";
  node.dataset.rank = position;
  node.classList.toggle("rank-panel", position !== "0");
}
export function trackRank(node, playerId) { targets.set(node, playerId); decorateRank(node, rankSnapshot.rank(playerId)); }
function repaint() { for (const [node,id] of targets) { if (!node.isConnected) targets.delete(node); else decorateRank(node,rankSnapshot.rank(id)); } }
let pending;
export async function refreshRanks() {
  if (pending) return pending;
  pending = (async () => {
    try { const response = await apiFetch("/api/rankings", {cache:"no-store",signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.players)) { rankSnapshot.update(data.players); repaint(); }
    } catch { /* Keep the last successful decoration if offline. */ }
    finally { pending = null; }
  })();
  return pending;
}
export function lockRanks() { rankSnapshot.lock(); }
export function unlockRanks() { rankSnapshot.unlock(); repaint(); void refreshRanks(); }
if (typeof window !== "undefined") {
  window.addEventListener("casino:account", () => void refreshRanks());
  window.addEventListener("casino:profile-updated", () => void refreshRanks());
  setInterval(() => { if (!document.hidden) void refreshRanks(); }, 30000);
}
