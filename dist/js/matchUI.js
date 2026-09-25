const SUITS = ["♠", "♦", "♥", "♣"];
const suitOf = (id) => SUITS[(Number(id) - 1) % SUITS.length] ?? "♠";

/** 相手検索ページの描画と操作。通信のやり取りはMatchServiceに任せる。 */
export class MatchScreen {
  constructor(ui, service, { onStart } = {}) {
    this.ui = ui;
    this.service = service;
    this.onStart = onStart;
    this.filter = "open";
    this.query = "";
    this.bind();
  }

  get els() {
    return this.ui.els;
  }

  bind() {
    this.els["search-submit"].addEventListener("click", () => this.runSearch());
    this.els["search-input"].addEventListener("keydown", (event) => { if (event.key === "Enter") this.runSearch(); });
    this.els["search-input"].addEventListener("input", () => { if (!this.els["search-input"].value) this.clearSearch(); });
    this.els["search-clear"].addEventListener("click", () => this.clearSearch());
    [this.els["filter-open"], this.els["filter-all"]].forEach((button) => button.addEventListener("click", () => {
      this.filter = button.dataset.filter;
      this.renderFilters();
      this.render();
    }));
    this.els["invite-accept"].addEventListener("click", () => {
      this.els["invite-overlay"].hidden = true;
      this.service.accept();
    });
    this.els["invite-decline"].addEventListener("click", () => {
      this.els["invite-overlay"].hidden = true;
      this.service.decline();
    });
    this.els["room-leave"].addEventListener("click", () => {
      this.els["room-overlay"].hidden = true;
      this.service.cancel();
      this.render();
    });
    this.els["room-start"].addEventListener("click", () => {
      this.service.startMatch();
      this.beginMatch();
    });

    this.service.addEventListener("welcome", (event) => this.showId(event.detail.id));
    this.service.addEventListener("account", () => this.showId(this.service.id));
    this.service.addEventListener("connection", (event) => {
      if (!event.detail.connected) this.showId("—");
      this.render();
    });
    this.service.addEventListener("roster", () => this.render());
    this.service.addEventListener("invited", (event) => this.showInvite(event.detail.peerId));
    this.service.addEventListener("paired", (event) => this.showRoom(event.detail));
    this.service.addEventListener("declined", () => { this.ui.toast("申し込みが断られました"); this.render(); });
    this.service.addEventListener("left", () => { this.closeOverlays(); this.ui.toast("相手が部屋を出ました"); this.render(); });
    this.service.addEventListener("start", () => this.beginMatch());
  }

  showId(id) {
    this.els["my-id"].textContent = id ?? "—";
    this.els["banner-id"].textContent = id ?? "—";
  }

  open() {
    this.service.join();
    this.showId(this.service.id);
    this.clearSearch();
    this.renderFilters();
    this.ui.transitionTo("match");
  }

  /**
   * 対戦開始。マッチングはサーバー経由で動くが、対戦中の盤面同期はまだ未実装なので、
   * いまは各端末がそれぞれゲームを進める。誤解しないよう必ず知らせる。
   */
  beginMatch() {
    this.closeOverlays();
    this.onStart?.({ role: this.service.isHost ? "host" : "guest" });
    this.ui.toast(this.service.isHost ? "対戦を開始します" : "ホストがゲームを準備しています…");
  }

  closeOverlays() {
    this.els["invite-overlay"].hidden = true;
    this.els["room-overlay"].hidden = true;
  }

  clearSearch() {
    this.query = "";
    this.els["search-input"].value = "";
    this.els["list-title"].textContent = "おすすめ";
    this.render();
  }

  runSearch() {
    this.query = this.els["search-input"].value.trim();
    this.els["list-title"].textContent = this.query ? "検索結果" : "おすすめ";
    this.render();
  }

  renderFilters() {
    this.els["filter-open"].classList.toggle("is-selected", this.filter === "open");
    this.els["filter-all"].classList.toggle("is-selected", this.filter === "all");
  }

  players() {
    const found = this.query ? this.service.search(this.query) : this.service.roster();
    // 申し込み中の相手は「対戦できる」ではなくなるが、状況が見えるように残す。
    return this.filter === "open" ? found.filter((player) => player.status === "idle" || player.id === this.service.peerId) : found;
  }

  render() {
    const players = this.players();
    // 定期更新のたびに作り直すと、押した瞬間にノードが消えてタップが効かなくなる。
    const signature = JSON.stringify([this.filter, this.query, this.service.status, this.service.peerId, players.map(({ id, name, status, chips }) => `${id}:${name}:${status}:${chips}`)]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.els["player-list"].replaceChildren(...players.map((player) => this.createRow(player)));
    }
    const empty = this.els["list-empty"];
    empty.hidden = players.length > 0;
    if (!this.service.connected) empty.textContent = "サーバーに接続しています…　つながらない場合は通信環境を確認してください。";
    else if (this.query) empty.textContent = `ID ${this.query} のプレイヤーは見つかりませんでした。相手がメイン画面を開いているか確認してください。`;
    else if (this.filter === "open") empty.textContent = "対戦できるプレイヤーがいません。相手にメイン画面を開いてもらい、IDを教えてもらってください。";
    else empty.textContent = "ほかのプレイヤーを待っています…";
  }

  createRow(player) {
    const waiting = this.service.status !== "idle" && this.service.peerId === player.id;
    const busy = player.status !== "idle";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "player-row";
    row.dataset.id = player.id;
    row.disabled = busy || this.service.status !== "idle";
    const state = waiting ? '<em class="is-busy">申し込み中</em>' : busy ? '<em class="is-busy">対戦中</em>' : '<em class="is-open">対戦できる</em>';
    row.innerHTML = `<span class="player-badge">${suitOf(player.id)}</span>`
      + `<span class="player-main"><strong>${player.name}</strong>`
      + `<span class="player-meta">${state}<span>ID ${player.id}</span><span>全3ゲーム</span></span></span>`
      + `<span class="player-stat"><small>CHIP</small><b>${player.chips ?? 500}<i>C</i></b></span>`;
    row.addEventListener("click", () => this.invite(player));
    return row;
  }

  invite(player) {
    if (!this.service.invite(player.id)) return;
    this.ui.toast(`${player.name} に対戦を申し込みました。承認を待っています…`);
    this.render();
  }

  showInvite(peerId) {
    this.els["invite-name"].textContent = this.service.player(peerId)?.name ?? `PLAYER ${peerId}`;
    this.els["invite-overlay"].querySelector(".invite-suit").textContent = suitOf(peerId);
    this.els["invite-overlay"].hidden = false;
    this.ui.cue("notify");
  }

  showRoom({ peerId, isHost }) {
    const me = this.service.account?.name ?? `PLAYER ${this.service.id}`;
    const peer = this.service.player(peerId)?.name ?? `PLAYER ${peerId}`;
    this.els["room-host"].textContent = isHost ? me : peer;
    this.els["room-guest"].textContent = isHost ? peer : me;
    this.els["room-title"].textContent = "対戦部屋";
    this.els["room-start"].disabled = !isHost;
    this.els["room-start-note"].textContent = isHost ? "対戦開始" : "ホストの開始を待っています";
    this.els["room-overlay"].hidden = false;
    this.ui.cue("special");
    this.render();
  }
}
