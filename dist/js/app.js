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
const matchScreen = new MatchScreen(ui, matchService, { onStart: (options) => startGame(options) });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const CPU_PACE = { think: 1400, declare: 900, afterAction: 1200, highlight: 1600 };
let selectedMode = "solo";
let selectedDifficulty = "normal";
let busy = false;
let cpuSpecialUsed = false;
let onlineRole = null;
let onlinePendingSpecial = null;
let pendingGuestBetResolve = null;
let pendingGuestDebtResolve = null;
let guestRenderedRound = 0;
let guestStateQueue = Promise.resolve();
let localRematchReady = false;
let peerRematchReady = false;
let rematchStarting = false;

const isOnline = () => Boolean(onlineRole);
const isOnlineHost = () => onlineRole === "host";
const opponentOf = (actor) => actor === "player" ? "dealer" : "player";
const invertOutcome = (outcome) => outcome === "win" ? "loss" : outcome === "loss" ? "win" : outcome;

function resultForGuest(result) {
  if (!result) return null;
  const swap = (pair) => pair ? { player: pair.dealer, dealer: pair.player } : pair;
  return {
    ...structuredClone(result),
    outcome: invertOutcome(result.outcome),
    player: result.dealer,
    dealer: result.player,
    delta: result.deltas?.dealer ?? -result.delta,
    deltas: swap(result.deltas),
    grossDeltas: swap(result.grossDeltas),
    repayments: swap(result.repayments),
    stakes: swap(result.stakes),
    bets: swap(result.bets),
    bankrupt: result.bankrupt === "player" ? "dealer" : result.bankrupt === "dealer" ? "player" : null,
    chips: swap(result.chips),
    debts: swap(result.debts),
    netWorth: swap(result.netWorth),
    needsLoan: result.needsLoan?.map(opponentOf),
    matchWins: swap(result.matchWins),
    matchOutcome: invertOutcome(result.matchOutcome),
  };
}

function syncState(event = "state", result = null, action = null) {
  if (!isOnlineHost()) return;
  matchService.sendState({
    event,
    state: game.snapshot({ swapSeats: true }),
    result: resultForGuest(result),
    action,
  });
}

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

async function startGame(options = {}) {
  if (busy) return;
  localRematchReady = false;
  peerRematchReady = false;
  rematchStarting = false;
  onlineRole = options.role ?? null;
  ui.setOnlineRole(onlineRole);
  guestRenderedRound = 0;
  guestStateQueue = Promise.resolve();
  onlinePendingSpecial = null;
  const mode = onlineRole ? "online" : selectedMode;
  game.configure({ mode, difficulty: selectedDifficulty });
  document.body.dataset.mode = mode;
  ui.els["back-lobby"].hidden = true;
  ui.transitionTo("game");
  if (onlineRole === "guest") {
    busy = true;
    ui.setActions(false, "dealer");
    ui.els["round-status"].textContent = "HOST SETTING UP";
    return;
  }
  game.startMatch();
  await wait(430);
  await beginRound();
}

async function beginRound() {
  busy = true;
  cpuSpecialUsed = false;
  ui.els["standing-overlay"].hidden = true;
  if (isOnlineHost()) {
    game.setBet("player", await ui.requestBet(game, "player"));
    const guestBet = new Promise((resolve) => { pendingGuestBetResolve = resolve; });
    ui.els["round-status"].textContent = "PLAYER 2 BETTING";
    syncState("betRequest");
    game.setBet("dealer", await guestBet);
    pendingGuestBetResolve = null;
    syncState("betsLocked");
  } else if (game.mode === "duo") {
    game.setBet("player", await ui.requestBet(game, "player"));
    game.setBet("dealer", await ui.requestBet(game, "dealer"));
  } else {
    const bet = await ui.requestBet(game, "player");
    game.setBet("player", bet);
    game.setBet("dealer", bet);
  }
  const firstActor = await ui.runCoinToss(game.mode, {
    onDecision: isOnlineHost() ? ({ face, firstActor: hostFirst }) => {
      syncState("coinToss", null, { face, firstActor: opponentOf(hostFirst) });
    } : null,
  });
  game.startRound(firstActor);
  if (game.mode === "duo") await ui.requestHandoff(firstActor);
  ui.prepareRound(game, useSpecial);
  await ui.dealInitial(game);
  game.phase = "playing";
  // 21は即勝利にしない。それ以上引けなくなるだけで、勝敗はターンが終わってから決める。
  game.refreshAutoStand();
  syncState("roundStart");
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

  if (isOnlineHost() && game.actor === "dealer") {
    ui.els["round-status"].textContent = "PLAYER 2 TURN";
    ui.renderSpecials(game);
    syncState("turn");
    busy = false;
    return;
  }

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
  syncState("turn");
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
  syncState("hit", null, { actor: opponentOf(actor), card: structuredClone(card) });
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
  syncState("stand", null, { actor: opponentOf(actor) });
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
  if (onlineRole === "guest") { await sendGuestSpecial(id); return; }
  if (busy || game.phase !== "playing" || game.actor === "dealer" && game.mode === "solo") return;
  await executeSpecial(id, false);
}

async function executeSpecial(id, isAi, supplied = null) {
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
  syncState("specialStart", null, { id, actor: opponentOf(actor) });
  await ui.showSpecial(special, actor, isAi);
  if (id === "selectReverse") cardId = supplied?.cardId ?? (isAi ? highestCardId(game[opponent]) : await ui.chooseOpponentCard(game[opponent]));
  if (id === "shuffle") {
    if (supplied?.actorCardId && supplied?.opponentCardId) ({ actorCardId, opponentCardId } = supplied);
    else if (isAi) ({ actorCardId, opponentCardId } = bestSwap(game[actor], game[opponent]));
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
    if (isOnlineHost() && actor === "dealer" && !supplied?.discardId) {
      onlinePendingSpecial = { id, actor, isAi, chipsBefore, result };
      syncState("chooseDiscard");
      busy = false;
      return;
    }
    const discardId = supplied?.discardId ?? (isAi ? bestDiscardId(game[actor]) : await ui.chooseCards(game[actor], "捨てる手札を選択"));
    result.discarded = game.discardCard(actor, discardId);
    ui.renderHands(game);
  } else {
    ui.renderHands(game);
    if (id === "shuffle") await ui.animateCardChanges([{ target: actor, cardId: result.taken.id }, { target: opponent, cardId: result.given.id }]);
  }
  await ui.animateChipChange(game, chipsBefore);
  ui.renderSpecials(game);
  syncState("specialResult");
  const messages = {
    double: `勝負額が2倍の${result.wager}チップに!`, triple: `勝負額が3倍の${result.wager}チップに!`,
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
  syncState("showdown");
  await wait(700);
  const chipsBefore = { ...game.chips };
  const result = game.settle();
  ui.renderHands(game);
  await ui.animateChipChange(game, chipsBefore);
  if (!(await resolveDebtChoices(result))) return;
  refreshResultBalances(result);
  await wait(1300);
  // ラウンドごとは勝敗を出さず、チップの状況だけ見せる。勝敗画面は試合の最後だけ。
  if (result.matchComplete) {
    ui.showResult(result, game);
    syncState("result", result);
    matchService.saveResult({
      winner: result.matchOutcome,
      chips: result.chips,
      rounds: result.round,
    });
    return;
  }
  ui.showStanding(result, game);
  syncState("standing", result);
  busy = false;
}

function refreshResultBalances(result) {
  result.chips = { ...game.chips };
  result.debts = { ...game.debts };
  result.needsLoan = ["player", "dealer"].filter((actor) => game.chips[actor] <= 0);
  result.bankrupt = result.needsLoan[0] ?? null;
  result.netWorth = {
    player: game.chips.player - game.debts.player,
    dealer: game.chips.dealer - game.debts.dealer,
  };
  if (result.matchComplete) {
    result.matchOutcome = result.netWorth.player > result.netWorth.dealer ? "win"
      : result.netWorth.player < result.netWorth.dealer ? "loss" : "draw";
  }
}

async function resolveDebtChoices(result) {
  for (const actor of ["player", "dealer"]) {
    while (game.chips[actor] <= 0) {
      let shouldContinue = true;
      if (isOnlineHost() && actor === "dealer") {
        const guestChoice = new Promise((resolve) => { pendingGuestDebtResolve = resolve; });
        syncState("debtDecision", result, { actor: "player" });
        shouldContinue = await guestChoice;
        pendingGuestDebtResolve = null;
      } else if (actor === "player" || game.mode === "duo") {
        shouldContinue = await ui.requestDebtChoice(game, actor);
      } else {
        ui.toast("CPUが500チップを借りて続行します");
        await wait(900);
      }
      if (!shouldContinue) {
        if (isOnlineHost()) syncState("matchCancelled", result);
        returnToLobby();
        return false;
      }
      const beforeLoan = { ...game.chips };
      game.takeLoan(actor);
      refreshResultBalances(result);
      ui.updateScores(game);
      await ui.animateChipChange(game, beforeLoan);
      ui.toast(`${actor === "player" ? "自分" : "相手"}に500 CHIP追加・借金500`);
      syncState("debtUpdated", result);
    }
  }
  return true;
}

async function nextRound() {
  await beginRound();
}

function returnToLobby() {
  busy = false;
  game.phase = "idle";
  ["result-overlay", "handoff-overlay", "special-overlay", "coin-overlay", "select-card-overlay", "invite-overlay", "room-overlay", "bet-overlay", "standing-overlay", "debt-overlay"].forEach((id) => { ui.els[id].hidden = true; });
  matchService.cancel();
  onlineRole = null;
  onlinePendingSpecial = null;
  pendingGuestBetResolve = null;
  pendingGuestDebtResolve = null;
  guestRenderedRound = 0;
  guestStateQueue = Promise.resolve();
  localRematchReady = false;
  peerRematchReady = false;
  rematchStarting = false;
  ui.setOnlineRole(null);
  ui.els["back-lobby"].hidden = false;
  ui.transitionTo("lobby");
}

async function startRematch() {
  if (rematchStarting) return;
  rematchStarting = true;
  const role = onlineRole;
  busy = false;
  ui.els["result-overlay"].hidden = true;
  await startGame(role ? { role } : {});
}

async function requestRematch() {
  if (game.phase !== "settled" || localRematchReady) return;
  if (!isOnline()) {
    await startRematch();
    return;
  }
  localRematchReady = true;
  ui.els["result-rematch"].disabled = true;
  ui.els["result-rematch"].textContent = peerRematchReady ? "再戦を開始します…" : "相手を待っています…";
  matchService.sendAction({ type: "rematch" });
  if (peerRematchReady) await startRematch();
}

async function sendGuestSpecial(id) {
  if (busy || onlineRole !== "guest" || game.phase !== "playing" || game.actor !== "player") return;
  busy = true;
  ui.setActions(false, "player");
  const options = {};
  if (id === "selectReverse") options.cardId = await ui.chooseOpponentCard(game.dealer);
  if (id === "shuffle") {
    options.opponentCardId = await ui.chooseCards(game.dealer, "相手の全手札から交換する1枚を選択");
    options.actorCardId = await ui.chooseCards(game.player, "自分から渡す1枚を選択");
  }
  matchService.sendAction({ type: "special", id, options });
  ui.toast("相手端末で処理しています…");
}

async function handleRemoteAction(action) {
  if (action.type === "rematch" && isOnline()) {
    peerRematchReady = true;
    ui.toast("相手が再戦を希望しています");
    if (!localRematchReady) ui.els["result-delta"].textContent = "相手が再戦を希望しています";
    if (localRematchReady) await startRematch();
    return;
  }
  if (isOnlineHost() && action.type === "bet" && pendingGuestBetResolve) {
    const resolve = pendingGuestBetResolve;
    pendingGuestBetResolve = null;
    resolve(action.bet ?? {});
    return;
  }
  if (isOnlineHost() && action.type === "debtDecision" && pendingGuestDebtResolve) {
    const resolve = pendingGuestDebtResolve;
    pendingGuestDebtResolve = null;
    resolve(Boolean(action.continue));
    return;
  }
  if (!isOnlineHost() || game.phase !== "playing" || game.actor !== "dealer" || busy) return;
  if (action.type === "hit") { await performHit(false); return; }
  if (action.type === "stand") { await performStand(false); return; }
  if (action.type === "special") { await executeSpecial(action.id, false, action.options ?? {}); return; }
  if (action.type === "discard" && onlinePendingSpecial) {
    busy = true;
    const pending = onlinePendingSpecial;
    onlinePendingSpecial = null;
    pending.result.discarded = game.discardCard(pending.actor, action.cardId);
    ui.renderHands(game);
    await ui.animateChipChange(game, pending.chipsBefore);
    ui.renderSpecials(game);
    ui.toast("1枚引いて、選んだ手札を捨てた!");
    clearTurnLock(pending.actor);
    game.refreshAutoStand();
    if (game.isRoundOver()) { await wait(350); await finishRound(); return; }
    await enterTurn(false);
  }
}

async function receiveHostState(payload) {
  if (onlineRole !== "guest" || !payload?.state) return;
  const before = { ...game.chips };
  const newRound = payload.state.matchRound !== guestRenderedRound;
  game.restore(payload.state);
  document.body.dataset.mode = "online";
  if (payload.event === "betRequest") {
    busy = true;
    ui.els["standing-overlay"].hidden = true;
    const bet = await ui.requestBet(game, "player");
    game.setBet("player", bet);
    matchService.sendAction({ type: "bet", bet });
    ui.els["round-status"].textContent = "HOST BETTING";
    ui.toast("ベットを確定しました。相手を待っています…");
    return;
  }
  if (payload.event === "debtDecision") {
    busy = true;
    const shouldContinue = await ui.requestDebtChoice(game, "player");
    matchService.sendAction({ type: "debtDecision", continue: shouldContinue });
    if (!shouldContinue) returnToLobby();
    else ui.els["round-status"].textContent = "LOAN PROCESSING";
    return;
  }
  if (payload.event === "matchCancelled") {
    ui.toast("対戦相手がロビーへ退出しました");
    returnToLobby();
    return;
  }
  if (payload.event === "specialStart") {
    const special = getSpecial(payload.action?.id);
    if (special) await ui.showSpecial(special, payload.action?.actor ?? game.actor, false);
    return;
  }
  if (payload.event === "coinToss") {
    busy = true;
    await ui.runCoinToss("online", payload.action ?? {});
    return;
  }
  if (newRound) {
    guestRenderedRound = game.matchRound;
    ui.els["standing-overlay"].hidden = true;
    ui.prepareRound(game, useSpecial);
    // ホストから roundStart と turn が続けて届くため、ゲストは確定盤面を一度だけ描画する。
    ui.renderHands(game);
  } else if (payload.event === "hit" && payload.action?.card) {
    await ui.addCard(game, payload.action.actor, payload.action.card);
    ui.renderSpecials(game);
    await ui.animateChipChange(game, before);
  } else {
    ui.renderHands(game);
    ui.renderSpecials(game);
    await ui.animateChipChange(game, before);
  }
  ui.setActions(false, game.actor);
  if (payload.event === "chooseDiscard") {
    busy = true;
    const cardId = await ui.chooseCards(game.player, "引いたあと、捨てる手札を1枚選択");
    matchService.sendAction({ type: "discard", cardId });
    return;
  }
  if (payload.event === "standing") {
    ui.showStanding(payload.result, game);
    ui.els["standing-next"].disabled = true;
    ui.els["standing-next"].textContent = "ホストの操作を待っています";
    busy = true;
    return;
  }
  if (payload.event === "result") {
    ui.showResult(payload.result, game);
    busy = true;
    return;
  }
  if (["hit", "stand", "specialResult", "showdown", "betsLocked", "debtUpdated"].includes(payload.event)) {
    ui.setActions(false, game.actor);
    ui.els["round-status"].textContent = payload.event === "showdown" ? "SHOWDOWN" : "SYNCING...";
    busy = true;
    return;
  }
  const myTurn = game.phase === "playing" && game.actor === "player";
  ui.els["standing-next"].disabled = false;
  ui.els["standing-next"].innerHTML = "<span>NEXT GAME</span><small>次のゲームへ</small>";
  ui.setActions(myTurn, game.actor);
  ui.renderSpecials(game);
  ui.els["round-status"].textContent = myTurn ? "YOUR TURN" : "PLAYER 1 TURN";
  busy = !myTurn;
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
  if (button.dataset.mode === "duo") ui.els["duo-mode-dialog"].showModal();
}));
ui.els["match-back"].addEventListener("click", returnToLobby);
ui.els["game-start"].addEventListener("click", () => {
  if (selectedMode === "duo") ui.els["duo-mode-dialog"].showModal();
  else startGame();
});
ui.els["duo-device"].addEventListener("click", () => {
  ui.els["duo-mode-dialog"].close();
  startGame();
});
ui.els["duo-local"].addEventListener("click", () => {
  ui.els["duo-mode-dialog"].close();
  matchScreen.open();
});
ui.els["hit-button"].addEventListener("click", () => {
  if (onlineRole === "guest") {
    busy = true;
    ui.setActions(false, "player");
    matchService.sendAction({ type: "hit" });
    return;
  }
  performHit(false);
});
ui.els["stand-button"].addEventListener("click", () => {
  if (onlineRole === "guest") {
    busy = true;
    ui.setActions(false, "player");
    matchService.sendAction({ type: "stand" });
    return;
  }
  performStand(false);
});
ui.els["standing-next"].addEventListener("click", () => { if (onlineRole !== "guest") nextRound(); });
ui.els["standing-lobby"].addEventListener("click", returnToLobby);
ui.els["back-lobby"].addEventListener("click", returnToLobby);
ui.els["result-lobby"].addEventListener("click", returnToLobby);
ui.els["result-rematch"].addEventListener("click", requestRematch);
matchService.addEventListener("state", (event) => {
  const payload = event.detail.payload;
  guestStateQueue = guestStateQueue.then(() => receiveHostState(payload)).catch(() => {
    ui.toast("同期に失敗しました。再接続を待っています");
  });
});
matchService.addEventListener("action", (event) => handleRemoteAction(event.detail.payload));
matchService.addEventListener("left", () => {
  if (!isOnline()) return;
  ui.toast("相手が退出したため、メイン画面へ戻ります");
  setTimeout(returnToLobby, 900);
});

installSoundBoard();
ui.populateSkillGuide();
bindDialogs();
setMode("solo");
setDifficulty("normal");
matchService.join();
