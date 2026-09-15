import { CasinoDuelGame } from "./game.js";
import { SPECIALS, getSpecial } from "./skills.js";
import { GameUI } from "./ui.js";

const game = new CasinoDuelGame();
const ui = new GameUI();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let selectedMode = "solo";
let selectedDifficulty = "normal";
let actor = "player";
let busy = false;

function populateSkillGuide() {
  ui.els["skill-guide"].innerHTML = SPECIALS.map((skill) => `<article><b>${skill.icon}</b><strong>${skill.name}</strong><span>${skill.description}</span></article>`).join("");
}

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

async function beginRound() {
  busy = true;
  actor = "player";
  game.startRound();
  ui.prepareRound(game, useSpecial);
  ui.setActions(false);
  await ui.dealInitial(game);
  if (game.score("player") === 21 || game.score("dealer") === 21) {
    await finishRound();
    return;
  }
  game.phase = "player";
  ui.setActions(true, "player");
  ui.updateSpecialState(game);
  busy = false;
}

async function startGame() {
  if (busy) return;
  game.configure({ mode: selectedMode, difficulty: selectedDifficulty });
  ui.transitionTo("game");
  await wait(430);
  await beginRound();
}

async function playerHit() {
  if (busy || game.phase !== "player") return;
  busy = true;
  ui.setActions(false);
  const card = game.hit("player");
  await ui.addCard("player", card);
  ui.updateScores(game);
  const blockedCard = game.absorbBust();
  if (blockedCard) {
    ui.toast("SHIELD発動 — BUSTを無効化!");
    await ui.discardLast("player");
    ui.updateScores(game);
  } else if (game.score("player") > 21) {
    ui.shake();
    await finishRound();
    return;
  } else if (game.score("player") === 21) {
    await beginDealerTurn();
    return;
  }
  ui.setActions(true, "player");
  busy = false;
}

async function beginDealerTurn() {
  if (game.phase === "settled") return;
  busy = true;
  game.phase = "dealer";
  ui.updateSpecialState(game);
  ui.setActions(false);
  if (game.mode === "duo") {
    await ui.requestDealerHandoff();
    await ui.revealDealer(game);
    actor = "dealer";
    ui.setActions(true, "dealer");
    busy = false;
    return;
  }
  actor = "dealer";
  ui.els["round-status"].textContent = "DEALER THINKING";
  await ui.revealDealer(game);
  await wait(450);
  while (game.shouldDealerHit()) {
    const card = game.hit("dealer");
    await ui.addCard("dealer", card);
    ui.updateScores(game);
    await wait(280);
  }
  await finishRound();
}

async function dealerHit() {
  if (busy || game.mode !== "duo" || game.phase !== "dealer") return;
  busy = true;
  ui.setActions(false, "dealer");
  const card = game.hit("dealer");
  await ui.addCard("dealer", card);
  ui.updateScores(game);
  if (game.score("dealer") >= 21) {
    await finishRound();
    return;
  }
  ui.setActions(true, "dealer");
  busy = false;
}

async function finishRound() {
  busy = true;
  ui.setActions(false, game.mode === "duo" ? actor : "player");
  if (!game.dealerRevealed) await ui.revealDealer(game);
  const result = game.settle();
  ui.updateScores(game);
  await wait(350);
  ui.showResult(result);
  busy = false;
}

async function useSpecial(id) {
  if (busy || game.phase !== "player" || game.usedSpecial) return;
  const special = getSpecial(id);
  const result = game.useSpecial(id);
  if (!result.ok) { ui.toast(result.reason || "今は使えません"); return; }
  busy = true;
  ui.setActions(false);
  ui.updateSpecialState(game);
  await ui.showSpecial(special);
  if (id === "reverse") {
    await ui.replaceDealerLast(result.added);
    ui.toast("ディーラーの伏せカードを交換!");
  } else if (id === "double") {
    ui.updateScores(game);
    ui.toast("BETが2倍になった!");
  } else if (id === "shield") {
    ui.toast("次のBUSTを1回だけ防ぐ!");
  }
  ui.setActions(true, "player");
  busy = false;
}

function returnToLobby() {
  busy = false;
  game.phase = "idle";
  ui.els["result-overlay"].hidden = true;
  ui.els["handoff-overlay"].hidden = true;
  ui.els["special-overlay"].hidden = true;
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
ui.els["hit-button"].addEventListener("click", () => actor === "dealer" ? dealerHit() : playerHit());
ui.els["stand-button"].addEventListener("click", () => actor === "dealer" ? finishRound() : beginDealerTurn());
ui.els["next-round"].addEventListener("click", beginRound);
ui.els["back-lobby"].addEventListener("click", returnToLobby);
ui.els["result-lobby"].addEventListener("click", returnToLobby);

populateSkillGuide();
bindDialogs();
setMode("solo");
setDifficulty("normal");
