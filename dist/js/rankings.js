import { apiFetch } from "./backend.js";

const number = value => Number(value).toLocaleString("ja-JP");
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function identity(player) {
  const node = element("div", "ranking-identity");
  node.append(element("strong", "ranking-player-name", player.name),
    element("small", "ranking-player-id", `ID ${player.playerId}`));
  return node;
}
export function renderRankings(container, players, ownId) {
  container.replaceChildren();
  if (!players.length) {
    container.append(element("p", "ranking-empty", "まだプレイヤーがいません。最初のランクインを目指そう。"));
    return;
  }
  const own = players.find(player => player.playerId === ownId);
  const summary = element("div", "ranking-my-position",
    own ? `あなたの順位  ${own.rank}位 / ${number(players.length)}人` : `全${number(players.length)}プレイヤー`);
  const podium = element("div", "ranking-podium");
  podium.setAttribute("aria-label", "上位3名");
  for (const rank of [2, 1, 3]) {
    const player = players.find(item => item.rank === rank);
    if (!player) continue;
    const card = element("section", `podium-player podium-rank-${rank}`);
    if (player.playerId === ownId) card.classList.add("is-me");
    card.setAttribute("aria-label", `${rank}位 ${player.name}`);
    const medal = element("span", "podium-medal", rank === 1 ? "♛" : "♕");
    medal.setAttribute("aria-hidden", "true");
    const gain = element("p", "podium-gain", number(player.chips));
    gain.append(element("small", "", "CHIP"));
    card.append(medal, identity(player), gain, element("div", "podium-step", String(rank)));
    podium.append(card);
  }
  container.append(summary, podium);
  if (players.length > 3) {
    const list = element("ol", "ranking-list");
    list.start = 4;
    list.setAttribute("aria-label", "4位以降のランキング");
    for (const player of players.slice(3)) {
      const row = element("li", "ranking-row");
      if (player.playerId === ownId) row.classList.add("is-me");
      const gain = element("div", "ranking-gain", number(player.chips));
      gain.append(element("small", "", "CHIP"));
      row.append(element("span", "ranking-number", String(player.rank)), identity(player), gain);
      list.append(row);
    }
    container.append(list);
  }
}

const opener = document.getElementById("rankings-open");
const dialog = document.getElementById("rankings-dialog");
if (opener && dialog) {
  const status = document.getElementById("rankings-status");
  const content = document.getElementById("rankings-content");
  const refresh = document.getElementById("rankings-refresh");
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    status.textContent = "ランキングを読み込み中…";
    try {
      const response = await apiFetch("/api/rankings", { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
        throw Error("ランキングを取得できませんでした。サーバーの更新後、もう一度お試しください。");
      const data = await response.json();
      let ownId;
      try { ownId = JSON.parse(localStorage.getItem("casinoDuel.accountProfile"))?.playerId; } catch {}
      renderRankings(content, data.players, ownId);
      status.textContent = `全${number(data.totalPlayers)}人 · ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 更新`;
    } catch (error) { status.textContent = error.message; }
    finally { loading = false; refresh.disabled = false; }
  }
  opener.addEventListener("click", () => { dialog.showModal(); void load(); });
  refresh.addEventListener("click", load);
  document.getElementById("rankings-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
}
