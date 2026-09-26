import { SPECIALS } from "./skills.js";
import { MATCH_ROUNDS, CHIP_TYPES, inventoryValue } from "./game.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const opponentOf = (actor) => actor === "player" ? "dealer" : "player";

export class GameUI {
  constructor() {
    this.els = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
    this.toastTimer = null;
    this.onSpecial = null;
    this.onlineRole = null;
    this.currentNames = null;
  }

  setOnlineRole(role = null) {
    this.onlineRole = role;
  }

  setNames(names = null) {
    this.currentNames = names;
  }

  isVersus(game) {
    return game.mode === "duo" || game.mode === "online";
  }

  seatLabels(game) {
    if (game.names) return { player: game.names.player, dealer: game.names.dealer };
    return this.isVersus(game) ? { player: "PLAYER 1", dealer: "PLAYER 2" } : { player: "YOU", dealer: "DEALER" };
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

  createCard(card, { hidden = false, animation = "" } = {}) {
    const node = document.createElement("div");
    node.className = `playing-card ${card.color === "red" ? "is-red" : ""} ${hidden ? "is-face-down" : ""} ${animation}`.trim();
    node.dataset.cardId = card.id;
    node.setAttribute("aria-label", hidden ? "伏せカード" : `${card.symbol}${card.rank}`);
    node.innerHTML = `<div class="card-inner" aria-hidden="true"><div class="card-face"><span class="card-corner">${card.rank}<i>${card.symbol}</i></span><span class="card-suit">${card.symbol}</span><span class="card-corner bottom">${card.rank}<i>${card.symbol}</i></span></div><div class="card-back"></div></div>`;
    return node;
  }

  createChip(type) {
    const chip = document.createElement("i");
    chip.className = `casino-chip is-${type}`;
    chip.setAttribute("aria-hidden", "true");
    return chip;
  }

  createChipStack(type, count) {
    const stack = document.createElement("span");
    stack.className = "chip-stack";
    stack.dataset.type = type;
    stack.title = `${CHIP_TYPES[type].label} ${CHIP_TYPES[type].value} × ${count}`;
    stack.style.height = `${Math.max(18, 15 + Math.max(0, count - 1) * 4)}px`;
    for (let index = 0; index < count; index += 1) {
      const chip = this.createChip(type);
      chip.style.setProperty("--chip-y", `${index * 4}px`);
      stack.append(chip);
    }
    return stack;
  }

  renderChipCollection(container, inventory = {}) {
    container.replaceChildren(...Object.keys(CHIP_TYPES)
      .filter((type) => (inventory[type] ?? 0) > 0)
      .map((type) => this.createChipStack(type, inventory[type])));
  }

  cardIsHidden(game, target, index) {
    if (target !== "dealer" || index !== 1 || game.dealerRevealed) return false;
    if (game.mode === "online") return true;
    return !(game.mode === "duo" && game.actor === "dealer");
  }

  prepareRound(game, onSpecial) {
    this.currentNames = game.names;
    this.onSpecial = onSpecial;
    this.els["dealer-hand"].replaceChildren();
    this.els["player-hand"].replaceChildren();
    this.els["result-overlay"].hidden = true;
    this.els["result-overlay"].className = "result-overlay";
    this.els["next-card-preview"].hidden = true;
    this.updateWager(game);
    this.els["round-progress"].textContent = `GAME ${game.matchRound} / ${MATCH_ROUNDS}`;
    const labels = this.seatLabels(game);
    this.els["rival-chip-label"].textContent = labels.dealer;
    this.els["my-chip-label"].textContent = labels.player;
    this.els["dealer-hand-name"].textContent = labels.dealer;
    this.els["player-hand-name"].textContent = labels.player;
    this.updateScores(game);
    this.renderSpecials(game, true);
    this.setActions(false, game.actor);
  }

  async dealInitial(game) {
    const sequence = [["player", 0], ["dealer", 0], ["player", 1], ["dealer", 1]];
    for (const [target, index] of sequence) {
      const card = game[target][index];
      this.els[`${target}-hand`].append(this.createCard(card, { hidden: this.cardIsHidden(game, target, index), animation: "deal-in" }));
      this.cue("deal");
      await wait(240);
    }
    if (game.matchRound === 1) {
      this.els["special-list"].querySelectorAll(".special-card").forEach((card, index) => {
        card.classList.add("skill-deal-in");
        card.style.setProperty("--skill-delay", `${index * 120}ms`);
      });
      this.els["opponent-arcana"].classList.add("is-dealing");
    } else this.els["opponent-arcana"].classList.remove("is-dealing");
    await wait(650);
    this.updateScores(game);
  }

  renderHands(game) {
    ["player", "dealer"].forEach((target) => {
      const cards = game[target].map((card, index) => this.createCard(card, { hidden: this.cardIsHidden(game, target, index) }));
      this.els[`${target}-hand`].replaceChildren(...cards);
    });
    this.updateScores(game);
  }

  async addCard(game, target, card) {
    const index = game[target].length - 1;
    const node = this.createCard(card, { hidden: this.cardIsHidden(game, target, index), animation: "hit-in" });
    this.els[`${target}-hand`].append(node);
    this.cue("deal");
    await wait(620);
    this.updateScores(game);
  }

  revealDealer(game) {
    game.dealerRevealed = true;
    const hidden = this.els["dealer-hand"].querySelector(".is-face-down");
    if (!hidden) { this.updateScores(game); return wait(0); }
    hidden.classList.remove("is-face-down");
    const card = game.dealer.find(({ id }) => id === hidden.dataset.cardId);
    if (card) hidden.setAttribute("aria-label", `${card.symbol}${card.rank}`);
    this.cue("flip");
    this.updateScores(game);
    return wait(700);
  }

  updateScores(game) {
    this.els["player-score"].textContent = game.score("player");
    // オンライン対戦では両端末が同じ合計点を常に表示する。
    // 以前は相手の伏せカードに合わせて最初の1枚分だけを表示していたため、
    // HIT後の合計がSHOWDOWNまで同期していないように見えていた。
    const visibleDealer = game.dealerRevealed || game.mode === "online" || (game.mode === "duo" && game.actor === "dealer");
    const dealerValue = visibleDealer ? game.score("dealer") : game.dealer[0] ? this.singleCardValue(game.dealer[0]) : "?";
    this.els["dealer-score"].textContent = dealerValue;
    this.els["dealer-score"].classList.toggle("is-hidden", !visibleDealer);
    this.els["player-chip-count"].textContent = game.chips.player;
    this.els["dealer-chip-count"].textContent = game.chips.dealer;
    this.renderChipCollection(this.els["player-chip-stack"], game.inventories?.player);
    this.renderChipCollection(this.els["dealer-chip-stack"], game.inventories?.dealer);
    ["player", "dealer"].forEach((actor) => {
      const debt = game.debts?.[actor] ?? 0;
      const node = this.els[`${actor}-debt-count`];
      node.textContent = `借金 ${debt}`;
      node.hidden = debt <= 0;
    });
    this.updateWager(game);
  }

  updateWager(game) {
    const own = game.bets?.player ?? { amount: game.wager, multiplier: 1, chips: {} };
    const rival = game.bets?.dealer ?? own;
    this.renderChipCollection(this.els["player-bet-stack"], own.chips);
    this.renderChipCollection(this.els["dealer-bet-stack"], rival.chips);
    this.els["wager-count"].textContent = `${own.amount ?? 0} / ${rival.amount ?? 0}`;
  }

  async animateChipPayout(result) {
    const actors = ["player", "dealer"].filter((actor) => Object.values(result.returns?.[actor] ?? {}).some(Boolean));
    for (const actor of actors) {
      const target = this.els[`${actor}-chip-count`].getBoundingClientRect();
      const flight = document.createElement("div");
      flight.className = "chip-payout-flight";
      flight.style.setProperty("--target-x", `${target.left + target.width / 2}px`);
      flight.style.setProperty("--target-y", `${target.top + target.height / 2}px`);
      Object.entries(result.returns[actor]).forEach(([type, count]) => {
        for (let index = 0; index < count; index += 1) flight.append(this.createChip(type));
      });
      document.body.append(flight);
      this.cue("chip");
      setTimeout(() => flight.remove(), 1600);
    }
    if (actors.length) await wait(1500);
  }

  async animateChipChange(game, before) {
    const changes = ["player", "dealer"].map((actor) => ({ actor, from: before[actor], to: game.chips[actor] })).filter(({ from, to }) => from !== to);
    if (!changes.length) { this.updateScores(game); return; }
    this.updateScores(game);
    const nodesFor = (actor) => [this.els[`${actor}-chip-count`]];
    changes.forEach(({ actor, from, to }) => {
      const nodes = nodesFor(actor);
      nodes.forEach((node) => {
        node.textContent = from;
        node.classList.add(to > from ? "chip-gain" : "chip-loss");
      });
      const anchor = nodes.at(-1);
      const rect = anchor.getBoundingClientRect();
      const delta = document.createElement("strong");
      delta.className = `chip-delta ${to > from ? "is-gain" : "is-loss"}`;
      delta.textContent = `${to > from ? "+" : ""}${to - from} CHIP`;
      delta.style.setProperty("--chip-x", `${rect.left + rect.width / 2}px`);
      delta.style.setProperty("--chip-y", `${rect.top}px`);
      document.body.append(delta);
      setTimeout(() => delta.remove(), 1500);
    });
    this.cue("chip");
    const steps = 18;
    for (let step = 1; step <= steps; step += 1) {
      changes.forEach(({ actor, from, to }) => {
        const value = Math.round(from + (to - from) * step / steps);
        nodesFor(actor).forEach((node) => { node.textContent = value; });
      });
      await wait(55);
    }
    await wait(250);
    changes.forEach(({ actor }) => nodesFor(actor).forEach((node) => node.classList.remove("chip-gain", "chip-loss")));
  }

  singleCardValue(card) {
    if (card.rank === "A") return 11;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return card.rank;
  }

  createSpecialCard(special, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `special-card tarot-card is-rank-${special.rank.toLowerCase()}`;
    button.dataset.special = special.id;
    button.dataset.rank = special.rank;
    button.innerHTML = `<span class="tarot-stars">✦ · ✧ · ✦</span><i class="rank-badge">${special.rank}</i><b>${special.icon}</b><span>${special.name}</span><small>${special.short}</small>`;
    button.disabled = disabled;
    button.addEventListener("click", () => this.onSpecial?.(special.id));
    return button;
  }

  renderSpecials(game, dealing = false) {
    const displayActor = game.mode === "solo" || game.mode === "online" ? "player" : game.actor;
    const canUse = game.phase === "playing" && game.actor === displayActor && !game.locked[displayActor];
    const cards = game.skills[displayActor].map((special) => this.createSpecialCard(special, !canUse));
    this.els["special-list"].replaceChildren(...cards);
    this.els["special-owner"].textContent = game.mode === "duo" ? `★ ${displayActor === "player" ? "PLAYER 1" : "PLAYER 2"} ARCANA` : "★ YOUR ARCANA";
    const opponent = opponentOf(displayActor);
    this.els["opponent-arcana"].replaceChildren(...game.skills[opponent].map(() => {
      const back = document.createElement("i");
      back.title = "相手の必殺技カード";
      return back;
    }));
    if (dealing) this.els["special-list"].querySelectorAll(".special-card").forEach((card) => card.disabled = true);
    this.showReservedCard(game, displayActor);
  }

  showReservedCard(game, actor) {
    const card = game.reservedCard[actor];
    if (!card || game.actor !== actor) { this.els["next-card-preview"].hidden = true; return; }
    const preview = this.createCard(card);
    preview.classList.add("preview-card");
    this.els["next-card-preview"].replaceChildren(preview);
    this.els["next-card-preview"].hidden = false;
  }

  setActions(enabled, actor) {
    this.els["hit-button"].disabled = !enabled;
    this.els["stand-button"].disabled = !enabled;
    const dealerTurn = actor === "dealer";
    this.els["hit-button"].querySelector("small").textContent = dealerTurn ? "ディーラーが引く" : "カードを引く";
    this.els["stand-button"].querySelector("small").textContent = dealerTurn ? "ディーラーが止まる" : "勝負する";
    this.els["round-status"].textContent = dealerTurn ? "DEALER TURN" : "PLAYER TURN";
    const online = document.body.dataset.mode === "online";
    this.els["dealer-kicker"].textContent = online ? this.seatLabels({ mode: "online", names: this.currentNames }).dealer
      : dealerTurn && document.body.dataset.mode === "duo" ? "PLAYER 2" : "THE HOUSE";
  }

  async showSpecial(special, actor, isAi = false) {
    this.els["special-focus-actor"].textContent = isAi ? "CPUが必殺技を発動" : actor === "player" ? "PLAYER SPECIAL" : "PLAYER 2 SPECIAL";
    this.els["special-focus-icon"].textContent = special.icon;
    this.els["special-focus-title"].textContent = special.name;
    this.els["special-focus-effect"].textContent = special.short;
    this.els["special-focus-description"].textContent = special.description;
    this.els["special-overlay"].classList.toggle("is-cpu-special", isAi);
    this.els["special-overlay"].hidden = false;
    this.cue("special");
    await wait(isAi ? 2900 : 1900);
    this.els["special-overlay"].hidden = true;
  }

  async highlightCard(target, cardId, message, duration) {
    return this.highlightCards([{ target, cardId }], message, duration);
  }

  async highlightCards(targets, message, duration = 1000) {
    const cards = targets.map(({ target, cardId }) => this.els[`${target}-hand`].querySelector(`[data-card-id="${cardId}"]`)).filter(Boolean);
    if (!cards.length) return;
    cards.forEach((card) => card.classList.add("is-targeted"));
    if (message) this.toast(message);
    this.cue("target");
    await wait(duration);
    cards.forEach((card) => card.classList.remove("is-targeted"));
  }

  async animateCardChanges(changes) {
    const cards = changes.map(({ target, cardId }) => this.els[`${target}-hand`].querySelector(`[data-card-id="${cardId}"]`)).filter(Boolean);
    if (!cards.length) return;
    cards.forEach((card) => card.classList.add("is-changing-in"));
    this.cue("deal");
    await wait(850);
    cards.forEach((card) => card.classList.remove("is-changing-in"));
  }

  async runCoinToss(mode, options = {}) {
    const overlay = this.els["coin-overlay"];
    const coin = this.els["duel-coin"];
    const choice = this.els["coin-choice"];
    overlay.hidden = false;
    overlay.classList.remove("is-decided");
    this.els["coin-heading"].textContent = "先攻を決める";
    coin.className = "duel-coin";
    let guess = null;
    if (mode === "solo") {
      choice.hidden = false;
      this.els["coin-result"].textContent = "表か裏を選んでください";
      guess = await new Promise((resolve) => {
        choice.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => resolve(button.dataset.coin), { once: true }));
      });
    } else {
      choice.hidden = true;
      this.els["coin-result"].textContent = "メダルを投げます…";
      await wait(450);
    }
    const face = options.face ?? (Math.random() < 0.5 ? "front" : "back");
    const firstActor = options.firstActor ?? (mode === "solo" ? (guess === face ? "player" : "dealer") : (face === "front" ? "player" : "dealer"));
    options.onDecision?.({ face, firstActor });
    coin.classList.add("is-tossing", `lands-${face}`);
    this.cue("coin");
    await wait(1350);
    const faceLabel = face === "front" ? "表 ♦" : "裏 ♠";
    const versusLabels = this.seatLabels({ mode, names: this.currentNames });
    const actorLabel = versusLabels[firstActor];
    const orderHeading = mode === "solo" ? (firstActor === "player" ? "あなたが先攻" : "あなたは後攻") : `${actorLabel}が先攻`;
    const secondActor = versusLabels[opponentOf(firstActor)];
    choice.hidden = true;
    overlay.classList.add("is-decided");
    this.els["coin-heading"].textContent = orderHeading;
    this.els["coin-result"].textContent = `${faceLabel} ／ ${actorLabel}が先攻・${secondActor}が後攻`;
    await wait(1500);
    overlay.hidden = true;
    return firstActor;
  }

  async requestHandoff(actor) {
    const actorName = this.currentNames?.[actor] ?? (actor === "player" ? "PLAYER 1" : "PLAYER 2");
    this.els["handoff-overlay"].hidden = false;
    this.els["handoff-overlay"].querySelector("h2").textContent = `${actorName} TURN`;
    this.els["handoff-overlay"].querySelector("small").textContent = "相手に必殺技カードを見られないように交代";
    this.els["dealer-ready"].textContent = `${actorName} 準備OK`;
    await new Promise((resolve) => this.els["dealer-ready"].addEventListener("click", resolve, { once: true }));
    this.els["handoff-overlay"].hidden = true;
  }

  async chooseCards(cards, heading = "捨てるカードを選択") {
    this.els["select-card-heading"].textContent = heading;
    const list = this.els["select-card-list"];
    list.replaceChildren(...cards.map((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.cardId = card.id;
      button.dataset.cue = "select";
      button.append(this.createCard(card));
      return button;
    }));
    this.els["select-card-overlay"].hidden = false;
    const cardId = await new Promise((resolve) => list.querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
      list.querySelectorAll("button").forEach((item) => { item.disabled = true; });
      button.classList.add("is-selected");
      await wait(1000);
      resolve(button.dataset.cardId);
    }, { once: true })));
    this.els["select-card-overlay"].hidden = true;
    return cardId;
  }

  chooseOpponentCard(cards) {
    return this.chooseCards(cards, "相手から捨てるカードを選択");
  }

  async chooseSwapCards(ownCards, opponentCards, labels = {}) {
    this.els["select-card-heading"].textContent = "交換するカードを1枚ずつ選択";
    const list = this.els["select-card-list"];
    list.classList.add("is-swap-picker");
    const selections = { opponentCardId: null, actorCardId: null };
    let confirm;
    const makeGroup = (title, cards, key) => {
      const group = document.createElement("section");
      group.className = "swap-card-group";
      const heading = document.createElement("h3");
      heading.textContent = title;
      const cardsNode = document.createElement("div");
      cardsNode.className = "swap-card-row";
      cards.forEach((card) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.cardId = card.id;
        button.dataset.swapKey = key;
        button.dataset.cue = "select";
        button.append(this.createCard(card));
        button.addEventListener("click", () => {
          cardsNode.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
          selections[key] = card.id;
          confirm.disabled = !selections.opponentCardId || !selections.actorCardId;
        });
        cardsNode.append(button);
      });
      group.append(heading, cardsNode);
      return group;
    };
    confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "swap-confirm";
    confirm.textContent = "この2枚を交換する";
    confirm.disabled = true;
    list.replaceChildren(
      makeGroup(`${labels.opponent ?? "相手"}の手札`, opponentCards, "opponentCardId"),
      makeGroup(`${labels.own ?? "自分"}の手札`, ownCards, "actorCardId"),
      confirm,
    );
    this.els["select-card-overlay"].hidden = false;
    await new Promise((resolve) => confirm.addEventListener("click", resolve, { once: true }));
    list.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    await wait(650);
    this.els["select-card-overlay"].hidden = true;
    list.classList.remove("is-swap-picker");
    return selections;
  }

  /** ラウンドごとの表示。勝敗は出さず、いまのお互いのチップだけ見せる。 */
  showStanding(result, game) {
    const duo = this.isVersus(game);
    const labels = this.seatLabels(game);
    this.els["standing-kicker"].textContent = `GAME ${result.round} / ${MATCH_ROUNDS} 終了`;
    this.els["standing-player-label"].textContent = labels.player;
    this.els["standing-dealer-label"].textContent = labels.dealer;
    const balanceLabel = (actor) => `${result.chips[actor]}${result.debts?.[actor] ? `（借金${result.debts[actor]}）` : ""}`;
    this.els["standing-player"].textContent = balanceLabel("player");
    this.els["standing-dealer"].textContent = balanceLabel("dealer");
    const setDelta = (node, value) => {
      node.textContent = value === 0 ? "±0" : `${value > 0 ? "+" : ""}${value}`;
      node.className = value > 0 ? "is-gain" : value < 0 ? "is-loss" : "";
    };
    setDelta(this.els["standing-player-delta"], result.deltas?.player ?? result.delta);
    setDelta(this.els["standing-dealer-delta"], result.deltas?.dealer ?? -result.delta);
    this.els["standing-overlay"].hidden = false;
  }

  /** 試合の最後だけ出す勝敗画面。借金を差し引いた純資産で勝敗を決める。 */
  showResult(result, game) {
    const overlay = this.els["result-overlay"];
    const mood = result.matchOutcome ?? "draw";
    const celebrate = mood === "win";
    const duo = this.isVersus(game);
    const labels = this.seatLabels(game);
    overlay.className = `result-overlay is-${mood} is-final`;
    const title = game.mode === "online"
      ? (mood === "win" ? "YOU WIN" : mood === "loss" ? `${labels.dealer} WIN` : "PUSH")
      : duo
        ? (mood === "win" ? "PLAYER 1 WIN" : mood === "loss" ? "PLAYER 2 WIN" : "PUSH")
      : (mood === "win" ? "You Win!" : mood === "loss" ? "You lose" : "PUSH");
    this.els["result-kicker"].textContent = `FINAL • ${MATCH_ROUNDS} GAMES`;
    this.els["result-title"].textContent = title;
    const debt = result.debts ?? { player: 0, dealer: 0 };
    const net = result.netWorth ?? {
      player: result.chips.player - debt.player,
      dealer: result.chips.dealer - debt.dealer,
    };
    this.els["result-score"].textContent = `${net.player} — ${net.dealer}`;
    this.els["result-delta"].textContent = "もう一回かロビー退出を選んでください";
    this.els["result-rematch"].disabled = false;
    this.els["result-rematch"].textContent = "もう一回";
    this.els["result-lobby"].disabled = false;
    this.makeConfetti(celebrate);
    overlay.hidden = false;
    if (mood === "loss") this.shake();
    this.cue(mood);
  }

  /** ラウンド開始前に賭け額を決めてもらう。 */
  async requestBet(game, actor = "player") {
    const overlay = this.els["bet-overlay"];
    const labels = this.seatLabels(game);
    const opponent = opponentOf(actor);
    const selected = { red: 0, blue: 0, black: 0 };
    this.els["bet-round"].textContent = `GAME ${game.matchRound + 1} / ${MATCH_ROUNDS}`;
    this.els["bet-my-label"].textContent = labels[actor];
    this.els["bet-rival-label"].textContent = labels[opponent];
    this.els["bet-my-chips"].textContent = game.chips[actor];
    this.els["bet-rival-chips"].textContent = game.chips[opponent];
    const list = this.els["bet-chip-picker"];
    const render = () => {
      const groups = Object.entries(CHIP_TYPES).map(([type, chipType]) => {
        const group = document.createElement("section");
        group.className = "chip-picker-group";
        const label = document.createElement("span");
        label.className = "chip-picker-label";
        label.innerHTML = `<strong>${chipType.value}</strong><small>${chipType.label} × ${game.inventories[actor][type]}</small>`;
        const row = document.createElement("div");
        row.className = "chip-token-row";
        for (let index = 0; index < game.inventories[actor][type]; index += 1) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `bet-chip-token ${index < selected[type] ? "is-selected" : ""}`;
          button.setAttribute("aria-label", `${chipType.value}チップ ${index < selected[type] ? "選択済み" : "未選択"}`);
          button.append(this.createChip(type));
          button.addEventListener("click", () => {
            selected[type] = index < selected[type] ? Math.max(0, selected[type] - 1) : Math.min(game.inventories[actor][type], selected[type] + 1);
            render();
          });
          row.append(button);
        }
        group.append(label, row);
        return group;
      });
      list.replaceChildren(...groups);
      const amount = inventoryValue(selected);
      this.els["bet-amount"].textContent = `${amount} CHIP`;
      this.els["bet-total-note"].textContent = amount ? `勝利時は${amount * 2}分が戻ります` : "1枚以上選んでください";
      this.els["bet-confirm"].disabled = amount <= 0;
      this.renderChipCollection(this.els["selected-chip-stack"], selected);
    };
    render();
    overlay.hidden = false;
    await new Promise((resolve) => this.els["bet-confirm"].addEventListener("click", resolve, { once: true }));
    overlay.hidden = true;
    return { chips: selected };
  }

  /** 破産した本人にだけ、退出か500チップの借り入れ継続かを選ばせる。 */
  async requestDebtChoice(game, actor = "player") {
    const labels = this.seatLabels(game);
    this.els["debt-owner"].textContent = `${labels[actor]}のチップが0以下になりました`;
    this.els["debt-balance"].textContent = `${game.chips[actor]} CHIP`;
    this.els["debt-total"].textContent = `現在の借金 ${game.debts?.[actor] ?? 0} CHIP`;
    const overlay = this.els["debt-overlay"];
    overlay.hidden = false;
    const choice = await new Promise((resolve) => {
      this.els["debt-continue"].addEventListener("click", () => resolve(true), { once: true });
      this.els["debt-lobby"].addEventListener("click", () => resolve(false), { once: true });
    });
    overlay.hidden = true;
    return choice;
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
    this.toastTimer = setTimeout(() => this.els.toast.classList.remove("is-visible"), 2300);
  }

  shake() {
    this.els["table-felt"].classList.remove("shake");
    requestAnimationFrame(() => this.els["table-felt"].classList.add("shake"));
  }

  populateSkillGuide() {
    this.els["skill-guide"].innerHTML = SPECIALS.map((skill) => `<article class="is-rank-${skill.rank.toLowerCase()}"><b>${skill.icon}</b><strong>${skill.name}<i>${skill.rank}</i></strong><span>${skill.description}</span></article>`).join("");
  }
}
