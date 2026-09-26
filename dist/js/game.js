import { createDeck, scoreHand } from "./deck.js";
import { dealSpecials } from "./skills.js";

const opponentOf = (actor) => actor === "player" ? "dealer" : "player";

/** 1試合のラウンド数。 */
export const MATCH_ROUNDS = 3;
/** 開始時の持ちチップ。 */
export const CHIP_TYPES = {
  red: { value: 100, label: "RED" },
  blue: { value: 500, label: "BLUE" },
  black: { value: 1000, label: "BLACK" },
};
export const STARTING_INVENTORY = { red: 5, blue: 3, black: 1 };
export const inventoryValue = (inventory = {}) => Object.entries(CHIP_TYPES)
  .reduce((sum, [type, chip]) => sum + (Number(inventory[type]) || 0) * chip.value, 0);
export const valueToInventory = (amount) => {
  let remaining = Math.max(0, Math.round(Number(amount) || 0));
  const inventory = { red: 0, blue: 0, black: 0 };
  ["black", "blue", "red"].forEach((type) => {
    inventory[type] = Math.floor(remaining / CHIP_TYPES[type].value);
    remaining %= CHIP_TYPES[type].value;
  });
  return inventory;
};
export const STARTING_CHIPS = inventoryValue(STARTING_INVENTORY);
/** ベットの最小単位。 */
export const BET_STEP = 100;
export const LOAN_AMOUNT = 500;

export class CasinoDuelGame {
  constructor() {
    this.mode = "solo";
    this.difficulty = "normal";
    this.names = { player: "YOU", dealer: "DEALER" };
    this.chips = { player: STARTING_CHIPS, dealer: STARTING_CHIPS };
    this.inventories = { player: { ...STARTING_INVENTORY }, dealer: { ...STARTING_INVENTORY } };
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
      inventories: swapPair(this.inventories),
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
      "mode", "difficulty", "names", "chips", "inventories", "debts", "baseWager", "wager", "bets", "skills", "matchRound",
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
      inventory: profiles[actor]?.inventory ? structuredClone(profiles[actor].inventory) : { ...STARTING_INVENTORY },
    });
    const player = profileOf("player", "YOU");
    const dealer = profileOf("dealer", "DEALER");
    this.names = { player: player.name, dealer: dealer.name };
    this.inventories = { player: player.inventory, dealer: dealer.inventory };
    this.chips = { player: inventoryValue(player.inventory), dealer: inventoryValue(dealer.inventory) };
    this.debts = { player: player.debt, dealer: dealer.debt };
    this.skills = dealSpecials();
    this.matchRound = 0;
    this.matchWins = { player: 0, dealer: 0 };
    this.baseWager = 100;
    this.bets = {
      player: { chips: { red: 0, blue: 0, black: 0 }, amount: 0, multiplier: 1 },
      dealer: { chips: { red: 0, blue: 0, black: 0 }, amount: 0, multiplier: 1 },
    };
  }

  /** 選んだ現物チップを手元からテーブルへ移す。 */
  setBet(actor, selection = {}) {
    const selected = { red: 0, blue: 0, black: 0 };
    Object.keys(selected).forEach((type) => {
      selected[type] = Math.max(0, Math.min(
        Math.round(Number(selection.chips?.[type]) || 0),
        Math.round(Number(this.inventories[actor]?.[type]) || 0),
      ));
    });
    let amount = inventoryValue(selected);
    if (amount <= 0) {
      const fallback = Object.keys(CHIP_TYPES).find((type) => this.inventories[actor]?.[type] > 0);
      if (fallback) { selected[fallback] = 1; amount = CHIP_TYPES[fallback].value; }
    }
    Object.keys(selected).forEach((type) => { this.inventories[actor][type] -= selected[type]; });
    this.chips[actor] = inventoryValue(this.inventories[actor]);
    this.bets[actor] = { chips: selected, amount, multiplier: 1 };
    if (actor === "player") {
      this.baseWager = amount;
      this.wager = amount;
    }
    return { ...this.bets[actor] };
  }

  wagerFor(actor) {
    const bet = this.bets[actor] ?? { amount: this.baseWager, multiplier: 1 };
    return bet.amount * bet.multiplier;
  }

  addInventory(actor, addition) {
    Object.keys(CHIP_TYPES).forEach((type) => { this.inventories[actor][type] += Number(addition?.[type]) || 0; });
    this.chips[actor] = inventoryValue(this.inventories[actor]);
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

    const stakes = { player: this.wagerFor("player"), dealer: this.wagerFor("dealer") };
    const loser = outcome === "win" ? "dealer" : outcome === "loss" ? "player" : null;
    const winner = outcome === "win" ? "player" : outcome === "loss" ? "dealer" : null;
    const repayments = { player: 0, dealer: 0 };
    const returns = { player: { red: 0, blue: 0, black: 0 }, dealer: { red: 0, blue: 0, black: 0 } };
    const grossDeltas = { player: 0, dealer: 0 };
    if (outcome === "draw") {
      ["player", "dealer"].forEach((actor) => {
        returns[actor] = { ...this.bets[actor].chips };
        this.addInventory(actor, returns[actor]);
      });
    } else {
      const bet = this.bets[winner];
      const profit = bet.amount * bet.multiplier;
      repayments[winner] = Math.min(profit, this.debts[winner]);
      this.debts[winner] -= repayments[winner];
      const surplusProfit = profit - repayments[winner];
      returns[winner] = { ...bet.chips };
      const profitChips = repayments[winner] === 0 && bet.multiplier === 1
        ? bet.chips
        : valueToInventory(surplusProfit);
      Object.keys(CHIP_TYPES).forEach((type) => { returns[winner][type] += profitChips[type]; });
      this.addInventory(winner, returns[winner]);
      if (loser && this.lossShield[loser]) {
        returns[loser].red = 1;
        this.addInventory(loser, returns[loser]);
      }
      grossDeltas[winner] = profit;
      grossDeltas[loser] = -this.bets[loser].amount + (this.lossShield[loser] ? 100 : 0);
    }
    const deltas = { ...grossDeltas };
    if (winner) deltas[winner] -= repayments[winner];
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
      outcome, blackjack, player, dealer, delta, deltas, grossDeltas, repayments, returns, stakes,
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
    this.debts[actor] += amount;
    this.addInventory(actor, valueToInventory(amount));
    return { chips: this.chips[actor], debt: this.debts[actor], amount };
  }
}
