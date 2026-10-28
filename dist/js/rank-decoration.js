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
  node.querySelector(".rank-laurel")?.remove();
  node.classList.remove("has-rank-laurel");
  if (![1,2,3].includes(rank)) return;
  node.classList.add("has-rank-laurel");
  const frame = document.createElement("span");
  frame.className = `rank-laurel rank-laurel-${rank}`;
  frame.setAttribute("aria-hidden", "true");
  const leaves = Array.from({length:6}, (_,i) => {
    const y = 26+i*9, x = 12-Math.sin(i/5*Math.PI)*8;
    return `<ellipse cx="${x}" cy="${y}" rx="3" ry="7" transform="rotate(-35 ${x} ${y})"/><ellipse cx="${100-x}" cy="${y}" rx="3" ry="7" transform="rotate(35 ${100-x} ${y})"/>`;
  }).join("");
  frame.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="47" r="36" fill="none" stroke="currentColor" stroke-width="2"/>${leaves}<path d="M8 28Q-4 73 42 90M92 28Q104 73 58 90" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="50" cy="88" r="10"/><text x="50" y="92" text-anchor="middle" fill="#211117" font-size="13" font-weight="bold">${rank}</text></svg>`;
  node.append(frame);
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