import { createDeck, scoreHand } from "./deck.js";
import { dealSpecials } from "./skills.js";

const opponentOf = (actor) => actor === "player" ? "dealer" : "player";

export class CasinoDuelGame {
  constructor() {
    this.mode = "solo";
    this.difficulty = "normal";
    this.chips = { player: 500, dealer: 500 };
    this.baseWager = 100;
    this.resetRound();
  }

  configure({ mode, difficulty }) {
    this.mode = mode;
    this.difficulty = difficulty;
  }

  resetRound() {
    this.deck = [];
    this.player = [];
    this.dealer = [];
    this.skills = { player: [], dealer: [] };
    this.reservedCard = { player: null, dealer: null };
    this.stood = { player: false, dealer: false };
    this.lossShield = { player: false, dealer: false };
    this.locked = { player: false, dealer: false };
    this.wager = this.baseWager;
    this.phase = "idle";
    this.actor = "player";
    this.dealerRevealed = false;
  }

  startRound(firstActor) {
    if (this.chips.player < this.baseWager || this.chips.dealer < this.baseWager) this.chips = { player: 500, dealer: 500 };
    this.resetRound();
    this.deck = createDeck();
    this.skills = dealSpecials();
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
    const result = { ok: true, skill, actor, opponent, keepTurn: false };

    if (id === "double") this.wager = Math.max(this.wager, 200);
    if (id === "triple") this.wager = 300;
    if (id === "shield") this.lossShield[actor] = true;
    if (id === "peek") this.reservedCard[actor] = this.drawCard();
    if (id === "reverse") {
      result.removed = this[opponent].pop();
      result.added = this.hit(opponent);
    }
    if (id === "selectReverse") {
      const index = Math.max(0, this[opponent].findIndex((card) => card.id === options.cardId));
      [result.removed] = this[opponent].splice(index, 1);
    }
    if (id === "shuffle") [this.player, this.dealer] = [this.dealer, this.player];
    if (id === "steal") {
      const amount = Math.min(50, this.chips[opponent]);
      this.chips[opponent] -= amount;
      this.chips[actor] += amount;
      result.amount = amount;
    }
    if (id === "extraDraw") {
      result.added = this.hit(actor);
      result.keepTurn = true;
    }
    if (id === "lock") this.locked[opponent] = true;
    return result;
  }

  chooseDealerSpecial() {
    if (this.locked.dealer || !this.skills.dealer.length || Math.random() > 0.42) return null;
    const playerScore = this.score("player");
    const dealerScore = this.score("dealer");
    const preferred = [
      dealerScore <= 15 && this.skills.dealer.find(({ id }) => id === "extraDraw"),
      playerScore >= 18 && this.skills.dealer.find(({ id }) => id === "selectReverse"),
      playerScore >= 18 && this.skills.dealer.find(({ id }) => id === "reverse"),
      dealerScore + 3 < playerScore && this.skills.dealer.find(({ id }) => id === "shuffle"),
      this.skills.dealer.find(({ id }) => id === "steal"),
      this.skills.dealer.find(({ id }) => id === "lock"),
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

    let amount = blackjack ? Math.round(this.wager * 1.5) : this.wager;
    const loser = outcome === "win" ? "dealer" : outcome === "loss" ? "player" : null;
    if (loser && this.lossShield[loser]) amount = Math.max(0, amount - 100);
    if (loser) amount = Math.min(amount, this.chips[loser]);
    const delta = outcome === "win" ? amount : outcome === "loss" ? -amount : 0;
    this.chips.player += delta;
    this.chips.dealer -= delta;
    this.phase = "settled";
    this.dealerRevealed = true;
    return { outcome, blackjack, player, dealer, delta, shielded: Boolean(loser && this.lossShield[loser]) };
  }
}
