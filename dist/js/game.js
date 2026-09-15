import { createDeck, scoreHand } from "./deck.js";

export class CasinoDuelGame {
  constructor() {
    this.mode = "solo";
    this.difficulty = "normal";
    this.chips = 500;
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
    this.wager = this.baseWager;
    this.phase = "idle";
    this.usedSpecial = null;
    this.shieldActive = false;
    this.dealerRevealed = false;
  }

  startRound() {
    if (this.chips < this.baseWager) this.chips = 500;
    this.resetRound();
    this.deck = createDeck();
    this.phase = "dealing";
    this.player.push(this.drawCard());
    this.dealer.push(this.drawCard());
    this.player.push(this.drawCard());
    this.dealer.push(this.drawCard());
  }

  drawCard() {
    if (!this.deck.length) this.deck = createDeck();
    return this.deck.pop();
  }

  hit(target) {
    const card = this.drawCard();
    this[target].push(card);
    return card;
  }

  score(target) {
    return scoreHand(this[target]).total;
  }

  useSpecial(id) {
    if (this.phase !== "player" || this.usedSpecial) return { ok: false };
    if (id === "double" && this.wager * 2 > this.chips) return { ok: false, reason: "チップが足りません" };
    this.usedSpecial = id;
    if (id === "double") this.wager *= 2;
    if (id === "shield") this.shieldActive = true;
    if (id === "reverse") {
      const removed = this.dealer.pop();
      const added = this.hit("dealer");
      return { ok: true, removed, added };
    }
    return { ok: true };
  }

  absorbBust() {
    if (!this.shieldActive || this.score("player") <= 21) return null;
    this.shieldActive = false;
    return this.player.pop();
  }

  shouldDealerHit() {
    const dealer = this.score("dealer");
    const player = this.score("player");
    if (this.difficulty === "easy") return dealer < 15;
    if (this.difficulty === "hard") return dealer < 17 || (dealer < player && dealer < 21);
    return dealer < 17;
  }

  settle() {
    const player = this.score("player");
    const dealer = this.score("dealer");
    const blackjack = player === 21 && dealer !== 21;
    let outcome = "draw";
    if (player > 21) outcome = "loss";
    else if (dealer > 21 || player > dealer) outcome = "win";
    else if (dealer > player) outcome = "loss";
    const delta = outcome === "win" ? Math.round(this.wager * (blackjack ? 1.5 : 1)) : outcome === "loss" ? -this.wager : 0;
    this.chips = Math.max(0, this.chips + delta);
    this.phase = "settled";
    return { outcome, blackjack, player, dealer, delta };
  }
}
