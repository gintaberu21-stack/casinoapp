import { CasinoDuelGame } from "./game.js";
import { getSpecial } from "./skills.js";
import { GameUI } from "./ui.js";
import { scoreHand } from "./deck.js";
import { installSoundBoard } from "./sound.js";
import { MatchService } from "./match.js";
import { MatchScreen } from "./matchUI.js";

const game = new CasinoDuelGame();
const ui = new GameUI();
const matchService = new MatchService();
const matchScreen = new MatchScreen(ui, matchService, { onStart: () => startGame() });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const CPU_PACE = { think: 1400, declare: 900, afterAction: 1200, highlight: 1600 };
let selectedMode = "solo";
let selectedDifficulty = "normal";
let busy = false;
let cpuSpecialUsed = false;

/** 行動（HIT / STAND）を終えてターンを相手に渡す。必殺技ではここを通らない。 */
function passTurn() {
  cpuSpecialUsed = false;
  game.switchActor();
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

async function startGame() {
  if (busy) return;
  game.configure({ mode: selectedMode, difficulty: selectedDifficulty });
  game.startMatch();
  document.body.dataset.mode = selectedMode;
  ui.transitionTo("game");
  await wait(430);
  await beginRound();
}

async function beginRound() {
  busy = true;
  cpuSpecialUsed = false;
  ui.els["standing-overlay"].hidden = true;
  game.setWager(await ui.requestBet(game));
  const firstActor = await ui.runCoinToss(game.mode);
  game.startRound(firstActor);
  if (game.mode === "duo") await ui.requestHandoff(firstActor);
  ui.prepareRound(game, useSpecial);
  await ui.dealInitial(game);
  game.phase = "playing";
  // 21は即勝利にしない。それ以上引けなくなるだけで、勝敗はターンが終わってから決める。
  game.refreshAutoStand();
  await enterTurn(false);
}

async function enterTurn(needsHandoff) {
  if (game.isRoundOver()) { await finishRound(); return; }
  if (game.stood[game.actor]) {
    passTurn();
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
    await wait(CPU_PACE.think);
    // 必殺技はターンを消費しないが、CPUが何枚も続けて使うと見ていられないので1ターン1枚まで。
    const specialId = cpuSpecialUsed ? null : game.chooseDealerSpecial();
    if (specialId) {
      cpuSpecialUsed = true;
      await executeSpecial(specialId, true);
      return;
    }
    if (game.dealerShouldHit()) {
      ui.toast("CPUはHIT — カードを1枚引きます");
      await wait(CPU_PACE.declare);
      await performHit(true);
    } else {
      ui.toast("CPUはSTAND — ここで勝負します");
      await wait(CPU_PACE.declare);
      await performStand(true);
    }
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
  if (isAi) {
    ui.toast(`CPUは ${card.symbol}${card.rank} を引いた`);
    await wait(CPU_PACE.afterAction);
  }
  clearTurnLock(actor);
  game.refreshAutoStand();
  if (game.score(actor) === 21 && !(game.mode === "solo" && actor === "dealer")) {
    ui.toast("21! これ以上は引けません。勝敗は勝負がついてから");
    await wait(1000);
  }
  if (game.isRoundOver()) { await finishRound(); return; }
  passTurn();
  await enterTurn(true);
}

async function performStand(isAi = false) {
  if (busy && !isAi || game.phase !== "playing") return;
  const actor = game.actor;
  busy = true;
  game.stood[actor] = true;
  clearTurnLock(actor);
  ui.setActions(false, actor);
  if (isAi) await wait(CPU_PACE.afterAction);
  if (game.isRoundOver()) { await finishRound(); return; }
  passTurn();
  await enterTurn(true);
}

function highestCardId(cards) {
  const values = { A: 11, K: 10, Q: 10, J: 10 };
  return [...cards].sort((a, b) => (values[b.rank] || Number(b.rank)) - (values[a.rank] || Number(a.rank)))[0]?.id;
}

function bestDiscardId(cards) {
  return cards.map((card) => {
    const remaining = cards.filter(({ id }) => id !== card.id);
    const total = scoreHand(remaining).total;
    return { id: card.id, value: total <= 21 ? total : -total };
  }).sort((a, b) => b.value - a.value)[0]?.id;
}

function bestSwap(cards, opponentCards) {
  const choices = [];
  cards.forEach((ownCard) => opponentCards.forEach((opponentCard) => {
    const ownAfter = cards.map((card) => card.id === ownCard.id ? opponentCard : card);
    const opponentAfter = opponentCards.map((card) => card.id === opponentCard.id ? ownCard : card);
    const ownScore = scoreHand(ownAfter).total;
    const opponentScore = scoreHand(opponentAfter).total;
    const ownValue = ownScore <= 21 ? ownScore : -30 - ownScore;
    const opponentValue = opponentScore > 21 ? 28 : -opponentScore;
    choices.push({ actorCardId: ownCard.id, opponentCardId: opponentCard.id, value: ownValue + opponentValue * 0.45 });
  }));
  return choices.sort((a, b) => b.value - a.value)[0];
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
  let actorCardId;
  let opponentCardId;
  const chipsBefore = { ...game.chips };
  await ui.showSpecial(special, actor, isAi);
  if (id === "selectReverse") cardId = isAi ? highestCardId(game[opponent]) : await ui.chooseOpponentCard(game[opponent]);
  if (id === "shuffle") {
    if (isAi) ({ actorCardId, opponentCardId } = bestSwap(game[actor], game[opponent]));
    else {
      opponentCardId = await ui.chooseCards(game[opponent], "相手の全手札から交換する1枚を選択");
      actorCardId = await ui.chooseCards(game[actor], "自分から渡す1枚を選択");
    }
  }
  if (["selectReverse", "shuffle"].includes(id)) {
    const targets = id === "shuffle" ? [{ target: actor, cardId: actorCardId }, { target: opponent, cardId: opponentCardId }] : [{ target: opponent, cardId }];
    const subject = isAi ? "CPU" : "必殺技";
    const message = id === "shuffle" ? `光っている2枚を${subject}が交換します` : "光っているカードが捨てられます";
    await ui.highlightCards(targets, message, isAi ? CPU_PACE.highlight : 1000);
  }
  const result = game.applySpecial(actor, id, { cardId, actorCardId, opponentCardId });
  if (!result.ok) { ui.toast(result.reason); busy = false; await enterTurn(false); return; }

  if (id === "extraDraw") {
    await ui.addCard(game, actor, result.added);
    const discardId = isAi ? bestDiscardId(game[actor]) : await ui.chooseCards(game[actor], "捨てる手札を選択");
    result.discarded = game.discardCard(actor, discardId);
    ui.renderHands(game);
  } else {
    ui.renderHands(game);
    if (id === "shuffle") await ui.animateCardChanges([{ target: actor, cardId: result.taken.id }, { target: opponent, cardId: result.given.id }]);
  }
  await ui.animateChipChange(game, chipsBefore);
  ui.renderSpecials(game);
  const messages = {
    double: `勝負額が2倍の${game.wager}チップに!`, triple: `勝負額が3倍の${game.wager}チップに!`,
    shield: "敗北時の損失を100軽減!", peek: "次に自分が引くカードを確保!",
    selectReverse: "選んだカードを捨てた!", shuffle: "選んだカードを1枚ずつ交換!",
    extraDraw: "1枚引いて、選んだ手札を捨てた!", lock: "相手の次ターンの必殺技を封印!",
  };
  ui.toast(messages[id]);
  if (isAi) await wait(CPU_PACE.afterAction);
  clearTurnLock(actor);
  // 必殺技で手札が変わるので、双方の自動STANDを見直す。
  game.refreshAutoStand();
  if (game.isRoundOver()) { await wait(350); await finishRound(); return; }
  // 必殺技はターンを消費しない。続けてHIT / STAND（または別の必殺技）を選べる。
  await enterTurn(false);
}

async function finishRound() {
  if (game.phase === "settled") return;
  busy = true;
  ui.setActions(false, game.actor);
  ui.els["round-status"].textContent = "SHOWDOWN";
  await wait(800);
  await ui.revealDealer(game);
  await wait(700);
  const chipsBefore = { ...game.chips };
  const result = game.settle();
  ui.renderHands(game);
  await ui.animateChipChange(game, chipsBefore);
  await wait(1300);
  // ラウンドごとは勝敗を出さず、チップの状況だけ見せる。勝敗画面は試合の最後だけ。
  if (result.matchComplete) {
    ui.showResult(result, game);
    await wait(6000);
    returnToLobby();
    return;
  }
  ui.showStanding(result, game);
  busy = false;
}

async function nextRound() {
  await beginRound();
}

function returnToLobby() {
  busy = false;
  game.phase = "idle";
  ["result-overlay", "handoff-overlay", "special-overlay", "coin-overlay", "select-card-overlay", "invite-overlay", "room-overlay", "bet-overlay", "standing-overlay"].forEach((id) => { ui.els[id].hidden = true; });
  matchService.cancel();
  ui.transitionTo("lobby");
}

function bindDialogs() {
  document.querySelectorAll("[data-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.dialog).showModal()));
  ui.els["difficulty-open"].addEventListener("click", () => ui.els["difficulty-dialog"].showModal());
  document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.addEventListener("click", () => { setDifficulty(button.dataset.difficulty); ui.els["difficulty-dialog"].close(); }));
}

// ボタンはすべてカチッと鳴らす。別の音にしたいものは data-cue で指定する。
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("button");
  if (button && !button.disabled) ui.cue(button.dataset.cue ?? "press");
}, true);
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
  setMode(button.dataset.mode);
  if (button.dataset.mode === "duo") matchScreen.open();
}));
ui.els["match-back"].addEventListener("click", returnToLobby);
ui.els["game-start"].addEventListener("click", startGame);
ui.els["hit-button"].addEventListener("click", () => performHit(false));
ui.els["stand-button"].addEventListener("click", () => performStand(false));
ui.els["standing-next"].addEventListener("click", nextRound);
ui.els["standing-lobby"].addEventListener("click", returnToLobby);
ui.els["back-lobby"].addEventListener("click", returnToLobby);
ui.els["result-lobby"].addEventListener("click", returnToLobby);

installSoundBoard();
ui.populateSkillGuide();
bindDialogs();
setMode("solo");
setDifficulty("normal");
matchService.join();
