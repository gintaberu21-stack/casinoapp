import { normalizeNickname, nicknameError } from "../dist/js/nickname.js";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { connect, close } from "./db.js";
import { Store } from "./store.js";
import { createAccessGate } from "./access.js";
import { accountProfileChanges } from "./account-profile.js";
import { recordBlackjackGains } from "./rankings.js";
import { slotAction } from "./slot.js";
import { rouletteAction } from "./roulette.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(currentDir, "..", "dist");
const port = Number(process.env.PORT) || 3000;
const HEARTBEAT_MS = 25000;
const access = createAccessGate({
  code: process.env.ACCESS_CODE,
  secret: process.env.ACCESS_TOKEN_SECRET,
});

const database = await connect(process.env.MONGODB_URI).catch((error) => {
  console.error("[db] 接続に失敗したのでメモリ保存で起動します:", error.message);
  return null;
});
const store = new Store(database);
await store.clearPlayers();
console.log(
  `[db] ${store.usesMongo ? "MongoDBに接続しました" : "メモリ保存で動作中（MONGODB_URI未設定）"}`,
);

const app = express();
const frontendOrigins = new Set((process.env.FRONTEND_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean));
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin) response.vary("Origin");
  if (frontendOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (request.method === "OPTIONS") return response.sendStatus(204);
  }
  if (request.method === "OPTIONS") return response.sendStatus(403);
  next();
});
app.get("/healthz", (_request, response) =>
  response.json({ ok: true, storage: store.usesMongo ? "mongodb" : "memory" }),
);
app.use(express.urlencoded({ extended: false }));
app.get("/access", access.showPage);
app.post("/access", access.submit);
app.use(access.middleware);
// 公開URLの入口はゲーム一覧。ブラックジャックのホームは /index.html に残す。
app.get("/", (_request, response) => response.sendFile(path.join(staticDir, "rooms.html")));
// 対戦ロジック更新後に古いJSが端末へ残ると同期版と混在するため、常に再検証する。
app.use(express.static(staticDir, { maxAge: 0, etag: true }));
app.get("/api/rankings", (_request, response) =>
  enqueue(async () => {
    try {
      const players = await store.leaderboard();
      response.setHeader("Cache-Control", "no-store");
      response.json({ players, totalPlayers: players.length });
    } catch {
      response.status(500).json({ error: "ランキングを取得できませんでした。もう一度お試しください。" });
    }
  }),
);
app.get("/api/matches", async (_request, response) => {
  try {
    response.json(await store.recentMatches());
  } catch {
    response.status(500).json({ error: "読み込みに失敗しました" });
  }
});

const server = http.createServer(app);
const sockets = new Map();
let operations = Promise.resolve();
const enqueue = (operation) => {
  operations = operations.then(operation).catch((error) => console.error("[ws]", error.message));
};
const STARTING_INVENTORY = { red: 5, blue: 3, black: 1 };
const INVENTORY_TYPES = [...Object.keys(STARTING_INVENTORY), "white"];
const cleanName = normalizeNickname;
const accountKeyFor = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const publicAccount = (account) =>
  account
    ? {
        playerId: account.playerId,
        name: account.name,
        avatar: account.avatar ?? null,
        chips: account.inventory ? Number(account.chips) || 0 : 3000,
        inventory: account.inventory ?? { ...STARTING_INVENTORY },
        debt: Math.max(0, Number(account.debt) || 0),
        bet: account.bet ?? { amount: 100, multiplier: 1 },
        gainedChips: account.gainedChips ?? 0,
        stats: account.stats ?? { matches: 0, wins: 0, losses: 0, draws: 0 },
      }
    : null;

const send = (socket, message) => {
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
};
const sendTo = (playerId, message) => send(sockets.get(playerId), message);

app.get("/api/account", (request, response) =>
  enqueue(async () => {
    const token = request.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const account = token.length >= 20 ? await store.findAccount(accountKeyFor(token)) : null;
    if (!account) return response.status(401).json({ error: "ホーム画面でアカウントにログインしてください。" });
    response.setHeader("Cache-Control", "no-store");
    response.json({ account: publicAccount(account) });
  }),
);
app.put("/api/account", express.json({ limit: "128kb" }), (request, response) =>
  enqueue(async () => {
    try {
      const token = request.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const account = token.length >= 20 ? await store.findAccount(accountKeyFor(token)) : null;
      if (!account) return response.status(401).json({ error: "ホーム画面でアカウントにログインしてください。" });
      const changes = accountProfileChanges(request.body);
      const updated = await store.updateAccount(account.playerId, changes);
      await store.updatePlayerProfile(account.playerId, publicAccount(updated));
      sendTo(account.playerId, { type: "account", account: publicAccount(updated) });
      response.json({ account: publicAccount(updated) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  }),
);

app.use("/api/slot", express.json({ limit: "4kb" }));
app.use("/api/roulette", express.json({ limit: "16kb" }));
app.post("/api/roulette/:action", (request, response) =>
  enqueue(async () => {
    try {
      if (!["state", "spin"].includes(request.params.action)) return response.sendStatus(404);
      const token = request.get("authorization")?.replace(/^Bearer /, "") ?? "";
      let account = token.length >= 20 ? await store.findAccount(accountKeyFor(token)) : null;
      if (!account)
        return response.status(401).json({ error: "ホーム画面でアカウントを作成してください" });
      if (account.pendingBet && !sockets.has(account.playerId))
        account = await store.updateAccount(account.playerId, { pendingBet: null });
      if (sockets.get(account.playerId)?.peerId || account.pendingBet)
        return response
          .status(409)
          .json({ error: "ブラックジャックの対戦・ベットを終了してください", balance: account.chips, account: publicAccount(account) });
      const result = await rouletteAction(store, account, request.params.action, request.body);
      const updated = await store.findAccountById(account.playerId);
      await store.updatePlayerProfile(account.playerId, publicAccount(updated));
      sendTo(account.playerId, { type: "account", account: publicAccount(updated) });
      response.json({ ...result, account: publicAccount(updated) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  }),
);
app.post("/api/slot/:action", (request, response) =>
  enqueue(async () => {
    try {
      if (!["state", "start", "stop"].includes(request.params.action))
        return response.sendStatus(404);
      const token = request.get("authorization")?.replace(/^Bearer /, "") ?? "";
      let account = token.length >= 20 ? await store.findAccount(accountKeyFor(token)) : null;
      if (!account)
        return response.status(401).json({ error: "先に既存のアカウントでログインしてください" });
      if (account.pendingBet && !sockets.has(account.playerId))
        account = await store.updateAccount(account.playerId, { pendingBet: null });
      const socket = sockets.get(account.playerId);
      if (socket?.peerId || account.pendingBet)
        return response
          .status(409)
          .json({ error: "ブラックジャックの対戦・ベットを終了してください", balance: account.chips, account: publicAccount(account) });
      const result = await slotAction(store, account, request.params.action, request.body);
      const updated = await store.findAccountById(account.playerId);
      await store.updatePlayerProfile(account.playerId, publicAccount(updated));
      sendTo(account.playerId, { type: "account", account: publicAccount(updated) });
      response.json({ ...result, account: publicAccount(updated) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  }),
);

async function broadcastRoster() {
  const players = await store.listPlayers();
  const payload = JSON.stringify({ type: "roster", players: players });
  sockets.forEach((socket) => {
    if (socket.readyState === 1) socket.send(payload);
  });
}

/** 申し込み中・対戦中の相手との関係を解消し、相手にも知らせる。 */
async function releasePeer(socket, reason) {
  const { peerId } = socket;
  // The stake is already deducted when a bet is confirmed. Never refund the departing account.
  if (socket.playerId) await store.updateAccount(socket.playerId, { pendingBet: null });
  if (!peerId) return;
  // 関係を先に解消し、連続する退出通知による二重返金を防ぐ。
  socket.peerId = null;
  const peerSocket = sockets.get(peerId);
  if (peerSocket && peerSocket.peerId === socket.playerId) {
    peerSocket.peerId = null;
    const remaining = await store.findAccountById(peerId);
    if (remaining?.pendingBet) {
      const inventory = { ...remaining.inventory };
      for (const type of INVENTORY_TYPES)
        inventory[type] = (inventory[type] ?? 0) + (remaining.pendingBet.chips[type] ?? 0);
      const account = await store.updateAccount(peerId, {
        chips: remaining.chips + remaining.pendingBet.amount,
        inventory,
        pendingBet: null,
      });
      await store.updatePlayerProfile(peerId, publicAccount(account));
      send(peerSocket, { type: "account", account: publicAccount(account) });
    }
    await store.setStatus(peerId, "idle", null);
    send(peerSocket, { type: reason, from: socket.playerId });
  }
  socket.peerId = null;
  await store.setStatus(socket.playerId, "idle", null);
}

const wss = new WebSocketServer({
  server,
  path: "/ws",
  verifyClient: ({ req }, done) => {
    const allowed = access.authorized(req);
    done(allowed, allowed ? 200 : 401, allowed ? "OK" : "Access code required");
  },
});

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.playerId = null;
  socket.peerId = null;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw) =>
    enqueue(async () => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (!message || typeof message.type !== "string") return;

      if (message.type === "join") {
        if (socket.playerId) return;
        const token = String(message.token ?? "");
        const nickname = cleanName(message.nickname);
        if (token.length < 20) {
          send(socket, { type: "accountError", message: "アカウント情報が無効です" });
          return;
        }
        socket.accountKey = accountKeyFor(token);
        let account = await store.findAccount(socket.accountKey);
        if (!account) {
          if (!nickname) {
            send(socket, { type: "accountRequired" });
            return;
          }
          if (nicknameError(nickname)) {
            send(socket, { type: "accountError", message: nicknameError(nickname) });
            return;
          }
          account = await store.createAccount(socket.accountKey, nickname);
        }
        const previous = sockets.get(account.playerId);
        if (previous && previous !== socket) {
          await releasePeer(previous, "left");
          previous.terminate();
          account = await store.findAccount(socket.accountKey);
        }
        if (account.pendingBet) {
          account = await store.updateAccount(account.playerId, { pendingBet: null });
        }
        socket.playerId = account.playerId;
        sockets.set(socket.playerId, socket);
        await store.addPlayer({
          playerId: socket.playerId,
          ...publicAccount(account),
          status: "idle",
          peerId: null,
          joinedAt: new Date(),
        });
        send(socket, { type: "welcome", id: socket.playerId, account: publicAccount(account) });
        await broadcastRoster();
        return;
      }

      if (!socket.playerId) return;
      const target = Number(message.to);

      if (message.type === "rename") {
        const name = cleanName(message.name);
        if (nicknameError(name)) {
          send(socket, { type: "accountError", message: nicknameError(name) });
          return;
        }
        if (!name) {
          send(socket, { type: "accountError", message: "名前を入力してください" });
          return;
        }
        const account = await store.updateAccount(socket.playerId, { name });
        await store.updatePlayerProfile(socket.playerId, { name });
        send(socket, { type: "account", account: publicAccount(account) });
        await broadcastRoster();
        return;
      }

      if (message.type === "profile") {
        const slotAccount = await store.findAccountById(socket.playerId);
        if (slotAccount?.slotRound && !slotAccount.slotRound.done) {
          send(socket, { type: "accountError", message: "スロットのスピンを終了してください" });
          return;
        }
        const normalize = (profile) => ({
          chips: Number.isFinite(Number(profile?.chips)) ? Math.round(Number(profile.chips)) : 3000,
          inventory: Object.fromEntries(
            INVENTORY_TYPES.map((type) => [
              type,
              Math.max(0, Math.min(999, Math.round(Number(profile?.inventory?.[type]) || 0))),
            ]),
          ),
          debt: Math.max(0, Math.round(Number(profile?.debt) || 0)),
          pendingBet: profile?.activeBet
            ? {
                amount: Math.max(0, Math.round(Number(profile?.bet?.amount) || 0)),
                chips: Object.fromEntries(
                  INVENTORY_TYPES.map((type) => [
                    type,
                    Math.max(0, Math.round(Number(profile?.bet?.chips?.[type]) || 0)),
                  ]),
                ),
              }
            : null,
          bet: {
            chips: Object.fromEntries(
              INVENTORY_TYPES.map((type) => [
                type,
                Math.max(0, Math.round(Number(profile?.bet?.chips?.[type]) || 0)),
              ]),
            ),
            amount: Math.max(0, Math.round(Number(profile?.bet?.amount) || 0)),
            multiplier: Math.max(1, Math.round(Number(profile?.bet?.multiplier) || 1)),
          },
        });
        const own = await store.updateAccount(socket.playerId, normalize(message.own));
        await store.updatePlayerProfile(socket.playerId, publicAccount(own));
        if (socket.peerId && message.peer) {
          const peer = await store.updateAccount(socket.peerId, normalize(message.peer));
          await store.updatePlayerProfile(socket.peerId, publicAccount(peer));
          sendTo(socket.peerId, { type: "account", account: publicAccount(peer) });
        }
        send(socket, { type: "account", account: publicAccount(own) });
        await broadcastRoster();
        return;
      }

      if (message.type === "invite") {
        const targetSocket = sockets.get(target);
        if (!targetSocket || targetSocket.peerId || socket.peerId) {
          send(socket, { type: "declined", from: target });
          return;
        }
        socket.peerId = target;
        targetSocket.peerId = socket.playerId;
        await store.setStatus(socket.playerId, "inviting", target);
        await store.setStatus(target, "invited", socket.playerId);
        send(targetSocket, { type: "invited", from: socket.playerId });
        await broadcastRoster();
        return;
      }

      if (message.type === "accept") {
        if (socket.peerId !== target) return;
        await store.setStatus(socket.playerId, "paired", target);
        await store.setStatus(target, "paired", socket.playerId);
        sendTo(target, { type: "accepted", from: socket.playerId });
        await broadcastRoster();
        return;
      }

      if (message.type === "decline" || message.type === "leave") {
        await releasePeer(socket, message.type === "decline" ? "declined" : "left");
        await broadcastRoster();
        return;
      }

      if (message.type === "start") {
        if (socket.peerId !== target) return;
        sendTo(target, { type: "start", from: socket.playerId });
        return;
      }

      // 対戦中のやり取り。ペアになっている相手にだけ中継する。
      if (message.type === "state" || message.type === "action") {
        if (socket.peerId !== target) return;
        sendTo(target, { type: message.type, from: socket.playerId, payload: message.payload });
        return;
      }

      if (message.type === "roundResult") {
        await recordBlackjackGains(store, socket.playerId, socket.peerId, message.payload);
        const account = await store.findAccountById(socket.playerId);
        send(socket, { type: "account", account: publicAccount(account) });
        if (socket.peerId) {
          const peer = await store.findAccountById(socket.peerId);
          sendTo(socket.peerId, { type: "account", account: publicAccount(peer) });
        }
        return;
      }

      if (message.type === "result") {
        await store.saveMatch({
          host: socket.playerId,
          guest: socket.peerId ?? null,
          ...message.payload,
        });
        const resultProfile = (actor) => ({
          chips: Math.round(Number(message.payload?.chips?.[actor]) || 0),
          debt: Math.max(0, Math.round(Number(message.payload?.debts?.[actor]) || 0)),
          inventory: message.payload?.inventories?.[actor] ?? { ...STARTING_INVENTORY },
          bet: message.payload?.bets?.[actor] ?? { amount: 100, multiplier: 1 },
          pendingBet: null,
        });
        await store.updateAccount(socket.playerId, resultProfile("player"));
        if (socket.peerId) await store.updateAccount(socket.peerId, resultProfile("dealer"));
        const hostOutcome =
          message.payload?.winner === "win"
            ? "win"
            : message.payload?.winner === "loss"
              ? "loss"
              : "draw";
        const guestOutcome =
          hostOutcome === "win" ? "loss" : hostOutcome === "loss" ? "win" : "draw";
        const hostAccount = await store.recordOutcome(socket.playerId, hostOutcome);
        send(socket, { type: "account", account: publicAccount(hostAccount) });
        if (socket.peerId) {
          const guestAccount = await store.recordOutcome(socket.peerId, guestOutcome);
          sendTo(socket.peerId, { type: "account", account: publicAccount(guestAccount) });
        }
        return;
      }

      if (message.type === "roster") await broadcastRoster();
    }),
  );

  socket.on("close", () =>
    enqueue(async () => {
      if (!socket.playerId) return;
      if (sockets.get(socket.playerId) !== socket) return;
      await releasePeer(socket, "left");
      sockets.delete(socket.playerId);
      await store.removePlayer(socket.playerId);
      await broadcastRoster();
    }),
  );
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

server.listen(port, () => console.log(`[web] http://localhost:${port} で待ち受け中`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    clearInterval(heartbeat);
    server.close();
    await close();
    process.exit(0);
  });
}
