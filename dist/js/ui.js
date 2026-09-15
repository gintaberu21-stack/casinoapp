import { SPECIALS } from "./skills.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class GameUI {
  constructor() {
    this.els = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
    this.toastTimer = null;
  }

  cue(name) {
    window.dispatchEvent(new CustomEvent("casino:cue", { detail: { name } }));
  }

  transitionTo(name) {
    const from = document.querySelector(".screen.is-active");
    const to = this.els[`${name}-screen`];
    if (from === to) return;
    from?.classList.add("is-leaving");
    setTimeout(() => {
      from?.classList.remove("is-active", "is-leaving");
      from?.setAttribute("aria-hidden", "true");
      to.classList.add("is-active");
      to.setAttribute("aria-hidden", "false");
    }, 360);
  }

  createCard(card, { hidden = false, animation = "deal-in" } = {}) {
    const node = document.createElement("div");
    node.className = `playing-card ${card.color === "red" ? "is-red" : ""} ${hidden ? "is-face-down" : ""} ${animation}`;
    node.dataset.cardId = card.id;
    node.setAttribute("aria-label", hidden ? "伏せカード" : `${card.symbol}${card.rank}`);
    node.innerHTML = `<div class="card-inner" aria-hidden="true"><div class="card-face"><span class="card-corner">${card.rank}<i>${card.symbol}</i></span><span class="card-suit">${card.symbol}</span><span class="card-corner bottom">${card.rank}<i>${card.symbol}</i></span></div><div class="card-back"></div></div>`;
    return node;
  }

  prepareRound(game, onSpecial) {
    this.els["dealer-hand"].replaceChildren();
    this.els["player-hand"].replaceChildren();
    this.els["result-overlay"].hidden = true;
    this.els["result-overlay"].className = "result-overlay";
    this.els["chip-count"].textContent = game.chips;
    this.els["wager-count"].textContent = game.wager;
    this.els["player-score"].textContent = "0";
    this.els["dealer-score"].textContent = "?";
    this.els["dealer-score"].classList.add("is-hidden");
    this.renderSpecials(game, onSpecial);
    this.setActions(false);
  }

  async dealInitial(game) {
    const sequence = [
      ["player", game.player[0], false], ["dealer", game.dealer[0], false],
      ["player", game.player[1], false], ["dealer", game.dealer[1], true],
    ];
    for (const [target, card, hidden] of sequence) {
      this.els[`${target}-hand`].append(this.createCard(card, { hidden }));
      this.cue("deal");
      await wait(250);
    }
    await wait(350);
    this.updateScores(game);
  }

  async addCard(target, card, hidden = false) {
    const node = this.createCard(card, { hidden, animation: "hit-in" });
    this.els[`${target}-hand`].append(node);
    this.cue("deal");
    await wait(620);
    return node;
  }

  async discardLast(target) {
    const card = this.els[`${target}-hand`].lastElementChild;
    card?.classList.add("redraw-out");
    await wait(400);
    card?.remove();
  }

  async replaceDealerLast(card) {
    await this.discardLast("dealer");
    await this.addCard("dealer", card, true);
  }

  async revealDealer(game) {
    const hidden = this.els["dealer-hand"].querySelector(".is-face-down");
    if (hidden) {
      hidden.classList.remove("is-face-down");
      const card = game.dealer.find(({ id }) => id === hidden.dataset.cardId);
      if (card) hidden.setAttribute("aria-label", `${card.symbol}${card.rank}`);
      this.cue("flip");
      await wait(700);
    }
    game.dealerRevealed = true;
    this.updateScores(game);
  }

  updateScores(game) {
    this.els["player-score"].textContent = game.score("player");
    const visibleDealerScore = game.dealerRevealed ? game.score("dealer") : game.dealer[0] ? this.singleCardValue(game.dealer[0]) : "?";
    this.els["dealer-score"].textContent = visibleDealerScore;
    this.els["dealer-score"].classList.toggle("is-hidden", !game.dealerRevealed);
    this.els["chip-count"].textContent = game.chips;
    this.els["wager-count"].textContent = game.wager;
  }

  singleCardValue(card) {
    if (card.rank === "A") return 11;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return card.rank;
  }

  renderSpecials(game, onSpecial) {
    this.els["special-list"].replaceChildren(...SPECIALS.map((special) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "special-card";
      button.dataset.special = special.id;
      button.innerHTML = `<b>${special.icon}</b><span>${special.name}</span><small>${special.short}</small>`;
      button.disabled = game.phase !== "player" || Boolean(game.usedSpecial);
      button.addEventListener("click", () => onSpecial(special.id));
      return button;
    }));
  }

  updateSpecialState(game) {
    this.els["special-list"].querySelectorAll("button").forEach((button) => { button.disabled = game.phase !== "player" || Boolean(game.usedSpecial); });
  }

  setActions(enabled, actor = "player") {
    this.els["hit-button"].disabled = !enabled;
    this.els["stand-button"].disabled = !enabled;
    const dealerTurn = actor === "dealer";
    this.els["hit-button"].querySelector("small").textContent = dealerTurn ? "ディーラーが引く" : "カードを引く";
    this.els["stand-button"].querySelector("small").textContent = dealerTurn ? "ディーラーが勝負" : "勝負する";
    this.els["round-status"].textContent = dealerTurn ? "DEALER TURN" : "YOUR TURN";
    this.els["dealer-kicker"].textContent = dealerTurn ? "PLAYER 2" : "THE HOUSE";
  }

  async showSpecial(special) {
    this.els["special-focus-icon"].textContent = special.icon;
    this.els["special-focus-title"].textContent = special.name;
    this.els["special-focus-effect"].textContent = special.short;
    this.els["special-overlay"].hidden = false;
    this.cue("special");
    await wait(1300);
    this.els["special-overlay"].hidden = true;
  }

  async requestDealerHandoff() {
    this.els["handoff-overlay"].hidden = false;
    await new Promise((resolve) => this.els["dealer-ready"].addEventListener("click", resolve, { once: true }));
    this.els["handoff-overlay"].hidden = true;
  }

  showResult(result) {
    const overlay = this.els["result-overlay"];
    overlay.className = `result-overlay is-${result.outcome}${result.blackjack ? " is-blackjack" : ""}`;
    const title = result.blackjack ? "BLACKJACK!!" : result.outcome === "win" ? "YOU WIN!" : result.outcome === "loss" ? "DEALER WIN" : "PUSH";
    this.els["result-kicker"].textContent = result.blackjack ? "PERFECT TWENTY-ONE" : "ROUND RESULT";
    this.els["result-title"].textContent = title;
    this.els["result-score"].textContent = `${result.player} — ${result.dealer > 21 ? "BUST" : result.dealer}`;
    this.els["result-delta"].textContent = result.delta === 0 ? "NO CHANGE" : `${result.delta > 0 ? "+" : ""}${result.delta} CHIP`;
    this.makeConfetti(result.outcome === "win");
    overlay.hidden = false;
    if (result.outcome === "loss") this.els["table-felt"].classList.add("shake");
    this.els["chip-count"].classList.add("bump");
    this.cue(result.blackjack ? "blackjack" : result.outcome);
    setTimeout(() => this.els["chip-count"].classList.remove("bump"), 500);
  }

  makeConfetti(show) {
    const container = this.els.confetti;
    container.replaceChildren();
    if (!show) return;
    const colors = ["#ffe177", "#b4142c", "#fff8e8"];
    for (let index = 0; index < 28; index += 1) {
      const piece = document.createElement("i");
      piece.style.cssText = `--x:${Math.random() * 100}%;--d:${2.1 + Math.random() * 2}s;--delay:${-Math.random() * 2}s;--c:${colors[index % colors.length]}`;
      container.append(piece);
    }
  }

  toast(message) {
    clearTimeout(this.toastTimer);
    this.els.toast.textContent = message;
    this.els.toast.classList.add("is-visible");
    this.toastTimer = setTimeout(() => this.els.toast.classList.remove("is-visible"), 2100);
  }

  shake() {
    this.els["table-felt"].classList.remove("shake");
    requestAnimationFrame(() => this.els["table-felt"].classList.add("shake"));
  }
}
