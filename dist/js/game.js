import { createDeck, scoreHand } from "./deck.js";
import { dealSpecials } from "./skills.js";

const opponentOf = (actor) => actor === "player" ? "dealer" : "player";

/** 1試合のラウンド数。 */
export const MATCH_ROUNDS = 3;
/** 開始時の持ちチップ。 */
export const STARTING_CHIPS = 500;
/** ベットの最小単位。 */
export const BET_STEP = 50;

export class CasinoDuelGame {
  constructor() {
    this.mode = "solo";
    this.difficulty = "normal";
    this.chips = { player: STARTING_CHIPS, dealer: STARTING_CHIPS };
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
      chips: swapPair(this.chips),
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
      "mode", "difficulty", "chips", "baseWager", "wager", "bets", "skills", "matchRound",
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

  startMatch() {
    this.chips = { player: STARTING_CHIPS, dealer: STARTING_CHIPS };
    this.skills = dealSpecials();
    this.matchRound = 0;
    this.matchWins = { player: 0, dealer: 0 };
    this.baseWager = 100;
    this.bets = {
      player: { amount: 100, multiplier: 1 },
      dealer: { amount: 100, multiplier: 1 },
    };
  }

  /** そのラウンドに賭けられる上限。相手が払えない額は賭けられない。 */
  maxWager(actor = "player", multiplier = 1) {
    const safeMultiplier = Math.max(1, Math.min(3, Number(multiplier) || 1));
    return Math.max(BET_STEP, Math.floor(this.chips[actor] / safeMultiplier / BET_STEP) * BET_STEP);
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
    const limit = this.maxWager(actor, multiplier);
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
    if (loser) stakes[loser] = Math.min(stakes[loser], this.chips[loser]);
    const deltas = outcome === "win"
      ? { player: stakes.player, dealer: -stakes.dealer }
      : outcome === "loss"
        ? { player: -stakes.player, dealer: stakes.dealer }
        : { player: 0, dealer: 0 };
    this.chips.player += deltas.player;
    this.chips.dealer += deltas.dealer;
    const delta = deltas.player;
    this.phase = "settled";
    this.dealerRevealed = true;
    if (outcome === "win") this.matchWins.player += 1;
    if (outcome === "loss") this.matchWins.dealer += 1;
    // チップが尽きたらその時点で敗北。残っていれば規定ラウンドまで続ける。
    const bankrupt = this.chips.player <= 0 ? "player" : this.chips.dealer <= 0 ? "dealer" : null;
    const matchComplete = Boolean(bankrupt) || this.matchRound >= MATCH_ROUNDS;
    return {
      outcome, blackjack, player, dealer, delta, deltas, stakes, bankrupt, matchComplete,
      shielded: Boolean(loser && this.lossShield[loser]),
      wager: this.wagerFor("player"),
      bets: structuredClone(this.bets),
      round: this.matchRound,
      matchWins: { ...this.matchWins },
      chips: { ...this.chips },
      // 勝敗はラウンド数ではなく最終的なチップの多さで決まる。
      matchOutcome: !matchComplete ? null
        : this.chips.player > this.chips.dealer ? "win"
          : this.chips.player < this.chips.dealer ? "loss" : "draw",
    };
  }
}
