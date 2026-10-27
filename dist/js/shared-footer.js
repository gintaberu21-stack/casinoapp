import { readGameRecords } from "./game-records.js";
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("../shared-footer.css?v=1", import.meta.url).href;
document.head.append(stylesheet);
const chipStyles = document.createElement("link");
chipStyles.rel = "stylesheet";
chipStyles.href = new URL("../shared-chips.css?v=1", import.meta.url).href;
document.head.append(chipStyles);
const responsiveStyles = document.createElement("link");
responsiveStyles.rel = "stylesheet";
responsiveStyles.href = new URL("../shared-responsive.css?v=1", import.meta.url).href;
document.head.append(responsiveStyles);
const nav = document.createElement("nav");
nav.className = "shared-footer";
nav.setAttribute("aria-label", "共通メニュー");
const icons = {
  home: '<path d="M3 12 15 3l12 9M6 10v17h7v-9h5v9h7V10"/>',
  record:
    '<path d="M9 3h12v9a6 6 0 0 1-12 0zM9 6H4v4a5 5 0 0 0 5 5M21 6h5v4a5 5 0 0 1-5 5M15 18v7M10 27h10"/>',
  help: '<path d="M15 6c-4-3-8-3-12-2v21c4-1 8-1 12 2 4-3 8-3 12-2V4c-4-1-8-1-12 2v21"/>',
};
const icon = (name) => `<svg viewBox="0 0 30 30" aria-hidden="true">${icons[name]}</svg>`;
nav.innerHTML = `<a href="./rooms.html">${icon("home")}<span>ロビー</span></a><button type="button" data-footer="record">${icon("record")}<span>戦績</span></button><button type="button" data-footer="help">${icon("help")}<span>遊び方</span></button>`;
if (location.pathname === "/" || location.pathname.endsWith("/rooms.html"))
  nav.querySelector("a").setAttribute("aria-current", "page");
const dialog = document.createElement("dialog");
dialog.className = "shared-footer-dialog";
const heading = document.createElement("h2");
const text = document.createElement("div");
const close = document.createElement("button");
close.type = "button";
close.textContent = "閉じる";
close.onclick = () => dialog.close();
dialog.append(heading, text, close);
document.body.append(nav, dialog);
function showRecords() {
  let account;
  try {
    account = JSON.parse(localStorage.getItem("casinoDuel.accountProfile"));
  } catch {}
  const records = readGameRecords();
  heading.textContent = "ゲーム別戦績";
  text.replaceChildren();
  const list = document.createElement("ul");
  list.className = "game-record-list";
  for (const [name, stats, practice] of [
    ["ブラックジャック", records.blackjack?.matches != null ? records.blackjack : account?.stats, false],
    ["ルーレット", records.roulette, false],
    ["スロット", records.slot, false],
  ]) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = name + (practice ? "（練習）" : "");
    const summary = document.createElement("span");
    summary.textContent = `${stats?.matches ?? 0}回　${stats?.wins ?? 0}勝 / ${stats?.losses ?? 0}敗 / ${stats?.draws ?? 0}分`;
    const gain = document.createElement("span");
    gain.className = "record-chip-gain";
    const gains = name === "ブラックジャック" ? records.blackjack : stats;
    gain.textContent = `獲得チップ：${Number(gains?.gained ?? 0).toLocaleString("ja-JP")} CHIP`;
    item.append(title, summary, gain);
    list.append(item);
  }
  const note = document.createElement("small");
  note.textContent =
    "ブラックジャックの勝敗は全ラウンド終了後の最終結果で1ゲームとして集計します。獲得チップは記録開始後の配当合計（ベットの返却分を含む）です。ルーレット・スロットの勝敗は配当−ベットで判定。記録はこのブラウザのアカウントごとに保存します。";
  text.append(list, note);
  if (!dialog.open) dialog.showModal();
}
// Account and in-game record buttons open the same list as the footer.
document.addEventListener(
  "click",
  (event) => {
    if (event.target.closest('#stats-open,[data-info="record"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showRecords();
    }
  },
  true,
);
nav.querySelectorAll("button").forEach((button) =>
  button.addEventListener("click", () => {
    if (button.dataset.footer === "record") {
      showRecords();
      return;
    } else {
      const rules = document.getElementById("rules") ?? document.getElementById("help");
      if (rules?.tagName === "DIALOG") {
        const trigger = document.getElementById("help-open");
        if (trigger) trigger.click();
        else rules.showModal();
        return;
      }
      heading.textContent = "遊び方";
      text.textContent =
        "ロビーで遊ぶ部屋を選んでください。ブラックジャックは21に近づけるゲーム、ルーレットは出目を予想するゲーム、絵柄合わせは中央に図柄を揃えるスロットです。ロビーは下のメニューからいつでも開けます。";
    }
    dialog.showModal();
  }),
);
