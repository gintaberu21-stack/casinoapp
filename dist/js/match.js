const ACCOUNT_TOKEN_KEY = "casinoDuel.accountToken";
const ACCOUNT_PROFILE_KEY = "casinoDuel.accountProfile";
const RETRY_MS = 2000;

/**
 * 相手検索と対戦申し込みの窓口。サーバーとWebSocketでやり取りする。
 * 画面側（matchUI.js）はこのクラスのメソッドとイベントだけを見ればよい。
 */
export class MatchService extends EventTarget {
  constructor() {
    super();
    this.id = null;
    this.status = "idle";
    this.peerId = null;
    this.isHost = false;
    this.players = [];
    this.socket = null;
    this.connected = false;
    this.retryTimer = null;
    this.token = localStorage.getItem(ACCOUNT_TOKEN_KEY);
    try { this.account = JSON.parse(localStorage.getItem(ACCOUNT_PROFILE_KEY)) ?? null; } catch { this.account = null; }
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  endpoint() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  /** メイン画面に入った時点で呼ぶ。IDはサーバーが連番で配る。 */
  join() {
    if (!this.token) return null;
    if (!this.socket) this.connect();
    return this.id;
  }

  connect() {
    let socket;
    try { socket = new WebSocket(this.endpoint()); } catch { this.scheduleRetry(); return; }
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.connected = true;
      this.emit("connection", { connected: true });
      this.send({ type: "join", token: this.token, nickname: this.account?.name });
    });
    socket.addEventListener("message", (event) => this.receive(event.data));
    socket.addEventListener("error", () => socket.close());
    socket.addEventListener("close", () => {
      this.connected = false;
      this.socket = null;
      this.status = "idle";
      this.peerId = null;
      this.players = [];
      this.emit("connection", { connected: false });
      this.emit("roster");
      this.scheduleRetry();
    });
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), RETRY_MS);
  }

  send(message) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  receive(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === "welcome") {
      this.id = message.id;
      this.setAccount(message.account);
      this.emit("welcome", { id: message.id, account: this.account });
      if (this.pendingProfile) this.send(this.pendingProfile);
      return;
    }
    if (message.type === "account") { this.setAccount(message.account); return; }
    if (message.type === "accountRequired") { this.emit("accountRequired"); return; }
    if (message.type === "accountError") { this.emit("accountError", { message: message.message }); return; }
    if (message.type === "roster") {
      this.players = message.players ?? [];
      const me = this.players.find((player) => player.playerId === this.id);
      if (me && !this.peerId) this.status = me.status;
      this.emit("roster");
      return;
    }
    if (message.type === "invited") {
      this.status = "invited";
      this.peerId = message.from;
      this.emit("invited", { peerId: message.from });
      return;
    }
    if (message.type === "accepted") {
      this.status = "paired";
      this.isHost = true;
      this.peerId = message.from;
      this.emit("paired", { peerId: message.from, isHost: true });
      return;
    }
    if (message.type === "declined") { this.reset(); this.emit("declined", { peerId: message.from }); return; }
    if (message.type === "left") { this.reset(); this.emit("left", { peerId: message.from }); return; }
    if (message.type === "start") { this.emit("start", { peerId: message.from }); return; }
    if (message.type === "state") { this.emit("state", { payload: message.payload }); return; }
    if (message.type === "action") this.emit("action", { payload: message.payload });
  }

  /** 自分以外の待機プレイヤー。サーバーから届いた一覧をそのまま使う。 */
  roster() {
    return this.players
      .filter((player) => player.playerId !== this.id)
      .map((player) => ({ id: player.playerId, name: player.name, status: player.status, chips: player.chips, debt: player.debt, bet: player.bet, stats: player.stats }))
      .sort((a, b) => a.id - b.id);
  }

  search(query) {
    const keyword = String(query ?? "").trim();
    if (!keyword) return [];
    return this.roster().filter((player) => String(player.id) === keyword || player.name.toLowerCase().includes(keyword.toLowerCase()));
  }

  invite(peerId) {
    if (this.status !== "idle" || !this.connected) return false;
    this.status = "inviting";
    this.peerId = peerId;
    this.isHost = true;
    this.send({ type: "invite", to: peerId });
    return true;
  }

  accept() {
    if (this.status !== "invited" || !this.peerId) return;
    this.status = "paired";
    this.isHost = false;
    this.send({ type: "accept", to: this.peerId });
    this.emit("paired", { peerId: this.peerId, isHost: false });
  }

  decline() {
    if (!this.peerId) return;
    this.send({ type: "decline", to: this.peerId });
    this.reset();
  }

  cancel() {
    if (this.peerId) this.send({ type: "leave", to: this.peerId });
    this.reset();
  }

  startMatch() {
    if (this.status !== "paired" || !this.peerId) return;
    this.send({ type: "start", to: this.peerId });
  }

  /** 対戦中、ホストが盤面を相手へ送る。 */
  sendState(payload) {
    if (this.peerId) this.send({ type: "state", to: this.peerId, payload });
  }

  /** 対戦中、ゲスト側の操作をホストへ送る。 */
  sendAction(payload) {
    if (this.peerId) this.send({ type: "action", to: this.peerId, payload });
  }

  saveResult(payload) {
    this.send({ type: "result", payload });
  }

  register(name) {
    const nickname = String(name ?? "").trim().slice(0, 16);
    if (!nickname) return false;
    this.token = crypto.randomUUID();
    this.account = { name: nickname, chips: 500, debt: 0, bet: { amount: 100, multiplier: 1 }, stats: { matches: 0, wins: 0, losses: 0, draws: 0 } };
    localStorage.setItem(ACCOUNT_TOKEN_KEY, this.token);
    localStorage.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(this.account));
    if (this.socket?.readyState === 1) this.send({ type: "join", token: this.token, nickname });
    else if (!this.socket) this.connect();
    return true;
  }

  setAccount(account) {
    if (!account) return;
    this.account = account;
    this.id = account.playerId ?? this.id;
    localStorage.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(account));
    this.emit("account", { account });
  }

  rename(name) {
    const nickname = String(name ?? "").trim().slice(0, 16);
    if (!nickname) return false;
    this.send({ type: "rename", name: nickname });
    return true;
  }

  saveProgress(own, peer = null) {
    if (this.account) this.setAccount({ ...this.account, chips: own.chips, debt: own.debt, bet: own.bet });
    this.pendingProfile = { type: "profile", own, peer };
    this.send(this.pendingProfile);
  }

  player(playerId) {
    return this.players.find((player) => player.playerId === Number(playerId)) ?? null;
  }

  reset() {
    this.status = "idle";
    this.peerId = null;
    this.isHost = false;
  }
}
