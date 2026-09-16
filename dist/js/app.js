import { CasinoDuelGame } from "./game.js";
import { getSpecial } from "./skills.js";
import { GameUI } from "./ui.js";

const game = new CasinoDuelGame();
const ui = new GameUI();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let selectedMode = "solo";
let selectedDifficulty = "normal";
let busy = false;

function setMode(mode) {
  selectedMode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const duo = mode === "duo";
  ui.els["difficulty-label"].textContent = duo ? "PLAYER 2" : selectedDifficulty.toUpperCase();
  ui.els["difficulty-open"].disabled = duo;
  ui.els["difficulty-open"].querySelector("em").textContent = duo ? "手動" : "変更";
}

function setDifficulty(difficulty) {
  selectedDifficulty = difficulty;
  ui.els["difficulty-label"].textContent = difficulty.toUpperCase();
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.classList.toggle("is-selected", button.dataset.difficulty === difficulty));
}

async function startGame() {
  if (busy) return;
  game.configure({ mode: selectedMode, difficulty: selectedDifficulty });
  document.body.dataset.mode = selectedMode;
  ui.transitionTo("game");
  await wait(430);
  await beginRound();
}

async function beginRound() {
  busy = true;
  const firstActor = await ui.runCoinToss(game.mode);
  game.startRound(firstActor);
  if (game.mode === "duo") await ui.requestHandoff(firstActor);
  ui.prepareRound(game, useSpecial);
  await ui.dealInitial(game);
  if (game.score("player") === 21 || game.score("dealer") === 21) {
    await finishRound();
    return;
  }
  game.phase = "playing";
  await enterTurn(false);
}

async function enterTurn(needsHandoff) {
  if (game.isRoundOver()) { await finishRound(); return; }
  if (game.stood[game.actor]) {
    game.switchActor();
    await enterTurn(false);
    return;
  }
  busy = true;
  if (game.mode === "duo" && needsHandoff) await ui.requestHandoff(game.actor);
  ui.renderHands(game);
  ui.renderSpecials(game);
  ui.setActions(false, game.actor);

  if (game.mode === "solo" && game.actor === "dealer") {
    ui.els["round-status"].textContent = "DEALER THINKING";
    await wait(650);
    const specialId = game.chooseDealerSpecial();
    if (specialId) {
      await executeSpecial(specialId, true);
      return;
    }
    if (game.dealerShouldHit()) await performHit(true);
    else await performStand(true);
    return;
  }

  if (game.locked[game.actor]) ui.toast("LOCK — このターンは必殺技を使えません");
  ui.setActions(true, game.actor);
  ui.renderSpecials(game);
  busy = false;
}

function clearTurnLock(actor) {
  if (game.locked[actor]) game.locked[actor] = false;
}

async function performHit(isAi = false) {
  if (busy && !isAi || game.phase !== "playing") return;
  const actor = game.actor;
  busy = true;
  ui.setActions(false, actor);
  const card = game.hit(actor);
  await ui.addCard(game, actor, card);
  clearTurnLock(actor);
  if (game.score(actor) >= 21) game.stood[actor] = true;
  if (game.isRoundOver()) { await finishRound(); return; }
  game.switchActor();
  await enterTurn(true);
}

async function performStand(isAi = false) {
  if (busy && !isAi || game.phase !== "playing") return;
  const actor = game.actor;
  busy = true;
  game.stood[actor] = true;
  clearTurnLock(actor);
  ui.setActions(false, actor);
  if (game.isRoundOver()) { await finishRound(); return; }
  game.switchActor();
  await enterTurn(true);
}

function highestCardId(cards) {
  const values = { A: 11, K: 10, Q: 10, J: 10 };
  return [...cards].sort((a, b) => (values[b.rank] || Number(b.rank)) - (values[a.rank] || Number(a.rank)))[0]?.id;
}

async function useSpecial(id) {
  if (busy || game.phase !== "playing" || game.actor === "dealer" && game.mode === "solo") return;
  await executeSpecial(id, false);
}

async function executeSpecial(id, isAi) {
  const actor = game.actor;
  const opponent = actor === "player" ? "dealer" : "player";
  const special = getSpecial(id);
  if (!special || game.locked[actor]) { ui.toast("今は必殺技を使えません"); return; }
  busy = true;
  ui.setActions(false, actor);
  let cardId;
  await ui.showSpecial(special, actor);
  if (id === "selectReverse") cardId = isAi ? highestCardId(game[opponent]) : await ui.chooseOpponentCard(game[opponent]);
  const result = game.applySpecial(actor, id, { cardId });
  if (!result.ok) { ui.toast(result.reason); busy = false; await enterTurn(false); return; }

  if (id === "extraDraw") await ui.addCard(game, actor, result.added);
  else ui.renderHands(game);
  ui.updateScores(game);
  ui.renderSpecials(game);
  const messages = {
    double: "勝負額が200チップに上昇!", triple: "勝負額が300チップに上昇!",
    reverse: "相手の最後のカードを引き直した!", shield: "敗北時の損失を100軽減!",
    peek: "次に自分が引くカードを確保!", selectReverse: "選んだカードを捨てた!",
    shuffle: "両者の手札をすべて交換!", steal: `${result.amount}チップを奪取!`,
    extraDraw: "追加ドロー成功 — もう一度行動!", lock: "相手の次ターンの必殺技を封印!",
  };
  ui.toast(messages[id]);
  clearTurnLock(actor);
  if (game.score(actor) >= 21) game.stood[actor] = true;
  if (game.isRoundOver()) { await wait(350); await finishRound(); return; }
  if (result.keepTurn) { await enterTurn(false); return; }
  game.switchActor();
  await enterTurn(true);
}

async function finishRound() {
  if (game.phase === "settled") return;
  busy = true;
  ui.setActions(false, game.actor);
  await ui.revealDealer(game);
  const result = game.settle();
  ui.renderHands(game);
  ui.updateScores(game);
  await wait(350);
  ui.showResult(result, game);
  busy = false;
}

function returnToLobby() {
  busy = false;
  game.phase = "idle";
  ["result-overlay", "handoff-overlay", "special-overlay", "coin-overlay", "select-card-overlay"].forEach((id) => { ui.els[id].hidden = true; });
  ui.transitionTo("lobby");
}

function bindDialogs() {
  document.querySelectorAll("[data-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.dialog).showModal()));
  ui.els["difficulty-open"].addEventListener("click", () => ui.els["difficulty-dialog"].showModal());
  document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.addEventListener("click", () => { setDifficulty(button.dataset.difficulty); ui.els["difficulty-dialog"].close(); }));
}

document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
ui.els["game-start"].addEventListener("click", startGame);
ui.els["hit-button"].addEventListener("click", () => performHit(false));
ui.els["stand-button"].addEventListener("click", () => performStand(false));
ui.els["next-round"].addEventListener("click", beginRound);
ui.els["back-lobby"].addEventListener("click", returnToLobby);
ui.els["result-lobby"].addEventListener("click", returnToLobby);

ui.populateSkillGuide();
bindDialogs();
setMode("solo");
setDifficulty("normal");
