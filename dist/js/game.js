import { createDeck, scoreHand } from "./deck.js";
import { dealSpecials } from "./skills.js";

const opponentOf = (actor) => actor === "player" ? "dealer" : "player";

/** 1試合のラウンド数。 */
export const MATCH_ROUNDS = 3;
/** 開始時の持ちチップ。 */
export const STARTING_CHIPS = 500;
/** ベットの最小単位。 */
export const BET_STEP = 50;
/** 各ゲームで選べる基本ベット上限。倍率は勝敗ポイントへ別途掛かる。 */
export const BET_CAPS = [150, 250, 500];
export const LOAN_AMOUNT = 500;

export class CasinoDuelGame {
  constructor() {
    this.mode = "solo";
    this.difficulty = "normal";
    this.names = { player: "YOU", dealer: "DEALER" };
    this.chips = { player: STARTING_CHIPS, dealer: STARTING_CHIPS };
    this.debts = { player: 0, dealer: 0 };
    this.baseWager = 100;
    this.bets = {
      player: { amount: 100, multiplier: 1 },
      dealer: { amount: 100, multiplier: 1 },
    };
    this.skills = { player: [], dealer: [] };
    this.matchRound = 0;
    this.matchWins = { player: 0, dealer: 0 };
    this.resetRound();
  }

  configure({ mode, difficulty }) {
    this.mode = mode;
    this.difficulty = difficulty;
  }

  /** ホストの確定状態を別端末へ送るための、JSON化可能なスナップショット。 */
  snapshot({ swapSeats = false } = {}) {
    const clone = (value) => structuredClone(value);
    const swapPair = (pair) => swapSeats
      ? { player: clone(pair.dealer), dealer: clone(pair.player) }
      : clone(pair);
    const swapActor = (actor) => swapSeats ? opponentOf(actor) : actor;
    return {
      mode: "online",
      difficulty: this.difficulty,
      names: swapPair(this.names),
      chips: swapPair(this.chips),
      debts: swapPair(this.debts),
      baseWager: this.baseWager,
      wager: this.wager,
      bets: swapPair(this.bets),
      skills: swapPair(this.skills),
      matchRound: this.matchRound,
      matchWins: swapPair(this.matchWins),
      player: clone(swapSeats ? this.dealer : this.player),
      dealer: clone(swapSeats ? this.player : this.dealer),
      reservedCard: swapPair(this.reservedCard),
      stood: swapPair(this.stood),
      autoStood: swapPair(this.autoStood),
      lossShield: swapPair(this.lossShield),
      locked: swapPair(this.locked),
      phase: this.phase,
      actor: swapActor(this.actor),
      dealerRevealed: this.dealerRevealed,
    };
  }

  /** ゲスト端末はゲーム計算をせず、ホストから届いた状態だけを表示する。 */
  restore(snapshot) {
    const fields = [
      "mode", "difficulty", "names", "chips", "debts", "baseWager", "wager", "bets", "skills", "matchRound",
      "matchWins", "player", "dealer", "reservedCard", "stood", "autoStood",
      "lossShield", "locked", "phase", "actor", "dealerRevealed",
    ];
    fields.forEach((field) => {
      if (snapshot[field] !== undefined) this[field] = structuredClone(snapshot[field]);
    });
    // 山札はホストだけが保持する。ゲスト側でカードを引く処理は実行しない。
    this.deck = [];
  }

  resetRound() {
    this.deck = [];
    this.player = [];
    this.dealer = [];
    this.reservedCard = { player: null, dealer: null };
    this.stood = { player: false, dealer: false };
    this.autoStood = { player: false, dealer: false };
    this.lossShield = { player: false, dealer: false };
    this.locked = { player: false, dealer: false };
    this.wager = this.baseWager;
    this.phase = "idle";
    this.actor = "player";
    this.dealerRevealed = false;
  }

  startMatch(profiles = {}) {
    const profileOf = (actor, fallbackName) => ({
      name: String(profiles[actor]?.name ?? fallbackName),
      chips: Number.isFinite(Number(profiles[actor]?.chips)) ? Math.round(Number(profiles[actor].chips)) : STARTING_CHIPS,
      debt: Math.max(0, Math.round(Number(profiles[actor]?.debt) || 0)),
      bet: profiles[actor]?.bet ?? { amount: 100, multiplier: 1 },
    });
    const player = profileOf("player", "YOU");
    const dealer = profileOf("dealer", "DEALER");
    this.names = { player: player.name, dealer: dealer.name };
    this.chips = { player: player.chips, dealer: dealer.chips };
    this.debts = { player: player.debt, dealer: dealer.debt };
    this.skills = dealSpecials();
    this.matchRound = 0;
    this.matchWins = { player: 0, dealer: 0 };
    this.baseWager = 100;
    this.bets = {
      player: { amount: Number(player.bet.amount) || 100, multiplier: Number(player.bet.multiplier) || 1 },
      dealer: { amount: Number(dealer.bet.amount) || 100, multiplier: Number(dealer.bet.multiplier) || 1 },
    };
  }

  /** 基本ベット上限はゲームごとに上がる。倍率はこの上限とは別に勝敗ポイントへ掛ける。 */
  maxWager(actor = "player") {
    const roundCap = BET_CAPS[Math.min(this.matchRound, BET_CAPS.length - 1)];
    const affordable = Math.floor(Math.max(0, this.chips[actor]) / BET_STEP) * BET_STEP;
    return Math.max(BET_STEP, Math.min(roundCap, affordable || BET_STEP));
  }

  /** ベット額を決める。下限はBET_STEP、上限は双方の残高。 */
  setWager(amount) {
    const limit = this.maxWager("player", 1);
    const stepped = Math.round(amount / BET_STEP) * BET_STEP;
    this.baseWager = Math.min(limit, Math.max(BET_STEP, stepped));
    this.wager = this.baseWager;
    this.setBet("player", { amount: this.baseWager, multiplier: 1 });
    this.setBet("dealer", { amount: this.baseWager, multiplier: 1 });
    return this.baseWager;
  }

  /** 各プレイヤーが自分の残高内で、金額と倍率を別々に決める。 */
  setBet(actor, selection = {}) {
    const multiplier = Math.max(1, Math.min(3, Math.round(Number(selection.multiplier) || 1)));
    const limit = this.maxWager(actor);
    const stepped = Math.round((Number(selection.amount) || BET_STEP) / BET_STEP) * BET_STEP;
    const amount = Math.min(limit, Math.max(BET_STEP, stepped));
    this.bets[actor] = { amount, multiplier };
    if (actor === "player") {
      this.baseWager = amount;
      this.wager = amount * multiplier;
    }
    return { ...this.bets[actor] };
  }

  wagerFor(actor) {
    const bet = this.bets[actor] ?? { amount: this.baseWager, multiplier: 1 };
    return bet.amount * bet.multiplier;
  }

  /** 賭け額を倍にする必殺技用。相手が払えない分までは増やさない。 */
  multiplyWager(factor, actor = "player") {
    const bet = this.bets[actor] ?? { amount: this.baseWager, multiplier: 1 };
    bet.multiplier *= factor;
    this.bets[actor] = bet;
    if (actor === "player") this.wager = this.wagerFor(actor);
    return this.wagerFor(actor);
  }

  startRound(firstActor) {
    this.resetRound();
    this.matchRound += 1;
    this.deck = createDeck();
    this.actor = firstActor;
    this.phase = "dealing";
    this.player.push(this.drawCard());
    this.dealer.push(this.drawCard());
    this.player.push(this.drawCard());
    this.dealer.push(this.drawCard());
  }

  drawCard(actor = null) {
    if (actor && this.reservedCard[actor]) {
      const reserved = this.reservedCard[actor];
      this.reservedCard[actor] = null;
      return reserved;
    }
    if (!this.deck.length) this.deck = createDeck();
    return this.deck.pop();
  }

  hit(actor) {
    const card = this.drawCard(actor);
    this[actor].push(card);
    return card;
  }

  score(actor) {
    return scoreHand(this[actor]).total;
  }

  /**
   * 21以上になった人はそれ以上引けないので自動でSTAND扱いにする。
   * 必殺技でカードを減らされて21未満に戻ったら、また行動できるようにする。
   * 自分の意思で押したSTANDは解除しない。
   */
  refreshAutoStand() {
    ["player", "dealer"].forEach((actor) => {
      if (this.score(actor) >= 21) {
        if (!this.stood[actor]) { this.stood[actor] = true; this.autoStood[actor] = true; }
      } else if (this.autoStood[actor]) {
        this.stood[actor] = false;
        this.autoStood[actor] = false;
      }
    });
  }

  switchActor() {
    this.actor = opponentOf(this.actor);
    return this.actor;
  }

  removeSkill(actor, id) {
    const index = this.skills[actor].findIndex((skill) => skill.id === id);
    if (index < 0) return null;
    return this.skills[actor].splice(index, 1)[0];
  }

  applySpecial(actor, id, options = {}) {
    if (this.phase !== "playing" || this.actor !== actor || this.locked[actor]) return { ok: false, reason: "今は必殺技を使えません" };
    const skill = this.removeSkill(actor, id);
    if (!skill) return { ok: false, reason: "そのカードは持っていません" };
    const opponent = opponentOf(actor);
    const result = { ok: true, skill, actor, opponent };

    if (id === "double") result.wager = this.multiplyWager(2, actor);
    if (id === "triple") result.wager = this.multiplyWager(3, actor);
    if (id === "shield") this.lossShield[actor] = true;
    if (id === "peek") this.reservedCard[actor] = this.drawCard();
    if (id === "selectReverse") {
      const index = Math.max(0, this[opponent].findIndex((card) => card.id === options.cardId));
      [result.removed] = this[opponent].splice(index, 1);
    }
    if (id === "shuffle") {
      const actorIndex = this[actor].findIndex((card) => card.id === options.actorCardId);
      const opponentIndex = this[opponent].findIndex((card) => card.id === options.opponentCardId);
      if (actorIndex < 0 || opponentIndex < 0) {
        this.skills[actor].push(skill);
        return { ok: false, reason: "交換するカードを選んでください" };
      }
      const actorCard = this[actor][actorIndex];
      const opponentCard = this[opponent][opponentIndex];
      this[actor][actorIndex] = opponentCard;
      this[opponent][opponentIndex] = actorCard;
      result.given = actorCard;
      result.taken = opponentCard;
    }
    if (id === "extraDraw") {
      result.added = this.hit(actor);
    }
    if (id === "lock") this.locked[opponent] = true;
    return result;
  }

  discardCard(actor, cardId) {
    const index = this[actor].findIndex((card) => card.id === cardId);
    if (index < 0) return null;
    return this[actor].splice(index, 1)[0];
  }

  chooseDealerSpecial() {
    const useChance = { easy: 0.58, normal: 0.76, hard: 0.92 }[this.difficulty] ?? 0.76;
    if (this.locked.dealer || !this.skills.dealer.length || Math.random() > useChance) return null;
    const playerScore = this.score("player");
    const dealerScore = this.score("dealer");
    const preferred = [
      playerScore >= 18 && this.skills.dealer.find(({ id }) => id === "selectReverse"),
      this.skills.dealer.find(({ id }) => id === "lock"),
      this.skills.dealer.find(({ id }) => id === "shuffle"),
      this.skills.dealer.find(({ id }) => id === "selectReverse"),
      dealerScore <= 15 && this.skills.dealer.find(({ id }) => id === "extraDraw"),
      this.skills.dealer.find(({ id }) => id === "shield"),
      dealerScore >= 17 && this.skills.dealer.find(({ id }) => ["double", "triple"].includes(id)),
      this.skills.dealer.find(({ id }) => id === "peek"),
    ].find(Boolean);
    return preferred?.id ?? null;
  }

  dealerShouldHit() {
    const dealer = this.score("dealer");
    const player = this.score("player");
    if (this.difficulty === "easy") return dealer < 15;
    if (this.difficulty === "hard") return dealer < 17 || (dealer < player && dealer < 21);
    return dealer < 17;
  }

  isRoundOver() {
    return this.score("player") > 21 || this.score("dealer") > 21 || (this.stood.player && this.stood.dealer);
  }

  settle() {
    const player = this.score("player");
    const dealer = this.score("dealer");
    const blackjack = player === 21 && dealer !== 21;
    let outcome = "draw";
    if (player > 21) outcome = "loss";
    else if (dealer > 21 || player > dealer) outcome = "win";
    else if (dealer > player) outcome = "loss";

    const stakes = {
      player: blackjack ? Math.round(this.wagerFor("player") * 1.5) : this.wagerFor("player"),
      dealer: this.wagerFor("dealer"),
    };
    const loser = outcome === "win" ? "dealer" : outcome === "loss" ? "player" : null;
    if (loser && this.lossShield[loser]) stakes[loser] = Math.max(0, stakes[loser] - 100);
    const grossDeltas = outcome === "win"
      ? { player: stakes.player, dealer: -stakes.dealer }
      : outcome === "loss"
        ? { player: -stakes.player, dealer: stakes.dealer }
        : { player: 0, dealer: 0 };
    const repayments = { player: 0, dealer: 0 };
    const deltas = { ...grossDeltas };
    ["player", "dealer"].forEach((actor) => {
      if (deltas[actor] <= 0 || this.debts[actor] <= 0) return;
      repayments[actor] = Math.min(deltas[actor], this.debts[actor]);
      this.debts[actor] -= repayments[actor];
      deltas[actor] -= repayments[actor];
    });
    this.chips.player += deltas.player;
    this.chips.dealer += deltas.dealer;
    const delta = deltas.player;
    this.phase = "settled";
    this.dealerRevealed = true;
    if (outcome === "win") this.matchWins.player += 1;
    if (outcome === "loss") this.matchWins.dealer += 1;
    const needsLoan = ["player", "dealer"].filter((actor) => this.chips[actor] <= 0);
    const bankrupt = needsLoan[0] ?? null;
    const matchComplete = this.matchRound >= MATCH_ROUNDS;
    const netWorth = {
      player: this.chips.player - this.debts.player,
      dealer: this.chips.dealer - this.debts.dealer,
    };
    return {
      outcome, blackjack, player, dealer, delta, deltas, grossDeltas, repayments, stakes,
      bankrupt, needsLoan, matchComplete, netWorth,
      shielded: Boolean(loser && this.lossShield[loser]),
      wager: this.wagerFor("player"),
      bets: structuredClone(this.bets),
      round: this.matchRound,
      matchWins: { ...this.matchWins },
      chips: { ...this.chips },
      debts: { ...this.debts },
      // 借金で順位が有利にならないよう、最終的な純資産で決める。
      matchOutcome: !matchComplete ? null
        : netWorth.player > netWorth.dealer ? "win"
          : netWorth.player < netWorth.dealer ? "loss" : "draw",
    };
  }

  /** チップ切れから続行するため、500チップを借りる。 */
  takeLoan(actor, amount = LOAN_AMOUNT) {
    this.chips[actor] += amount;
    this.debts[actor] += amount;
    return { chips: this.chips[actor], debt: this.debts[actor], amount };
  }
}
