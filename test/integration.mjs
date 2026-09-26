import assert from "node:assert/strict";
import WebSocket from "ws";
import { CasinoDuelGame } from "../dist/js/game.js";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3010";
const accessCode = process.env.TEST_ACCESS_CODE ?? "test-only";

const locked = await fetch(`${base}/`, { redirect: "manual" });
assert.equal(locked.status, 303);
assert.equal(locked.headers.get("location"), "/access");

const login = await fetch(`${base}/access`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code: accessCode }),
});
assert.equal(login.status, 302);
const cookie = login.headers.get("set-cookie").split(";")[0];

const health = await fetch(`${base}/healthz`);
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true);

class Client {
  constructor() {
    this.messages = [];
    this.waiters = [];
  }
  async open() {
    const wsUrl = base.replace(/^http/, "ws") + "/ws";
    this.socket = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw);
      const waiter = this.waiters.find(({ type }) => type === message.type);
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      } else this.messages.push(message);
    });
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  next(type) {
    const existing = this.messages.find((message) => message.type === type);
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1);
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 3000);
    });
  }
  close() { this.socket.close(); }
}

const host = new Client();
const guest = new Client();
await host.open();
await guest.open();
const hostToken = "integration-host-token-1234567890";
const guestToken = "integration-guest-token-123456789";
host.send({ type: "join", token: hostToken, nickname: "HOST TEST" });
guest.send({ type: "join", token: guestToken, nickname: "GUEST TEST" });
const hostWelcome = await host.next("welcome");
const guestWelcome = await guest.next("welcome");
const hostId = hostWelcome.id;
const guestId = guestWelcome.id;
assert.notEqual(hostId, guestId);
assert.equal(hostWelcome.account.name, "HOST TEST");
host.send({ type: "rename", name: "ACE" });
assert.equal((await host.next("account")).account.name, "ACE");
host.send({ type: "profile", own: { chips: 600, inventory: { red: 1, blue: 1, black: 0 }, debt: 100, bet: { chips: { red: 1 }, amount: 100, multiplier: 1 } } });
const savedAccount = (await host.next("account")).account;
assert.equal(savedAccount.chips, 600);
assert.equal(savedAccount.debt, 100);

host.send({ type: "invite", to: guestId });
assert.equal((await guest.next("invited")).from, hostId);
guest.send({ type: "accept", to: hostId });
assert.equal((await host.next("accepted")).from, guestId);
host.send({ type: "start", to: guestId });
assert.equal((await guest.next("start")).from, hostId);

host.send({ type: "state", to: guestId, payload: { turn: "guest" } });
assert.deepEqual((await guest.next("state")).payload, { turn: "guest" });
guest.send({ type: "action", to: hostId, payload: { type: "hit" } });
assert.deepEqual((await host.next("action")).payload, { type: "hit" });
guest.send({ type: "action", to: hostId, payload: { type: "bet", bet: { amount: 300, multiplier: 2 } } });
assert.deepEqual((await host.next("action")).payload, { type: "bet", bet: { amount: 300, multiplier: 2 } });
host.send({ type: "action", to: guestId, payload: { type: "rematch" } });
assert.deepEqual((await guest.next("action")).payload, { type: "rematch" });

const game = new CasinoDuelGame();
game.startMatch();
assert.deepEqual(game.inventories.player, { red: 5, blue: 3, black: 1 });
assert.equal(game.chips.player, 3000);
game.startRound("dealer");
const swapped = game.snapshot({ swapSeats: true });
assert.equal(swapped.actor, "player");
assert.deepEqual(swapped.player, game.dealer);
assert.deepEqual(swapped.chips, { player: game.chips.dealer, dealer: game.chips.player });
game.setBet("player", { chips: { red: 2 } });
game.setBet("dealer", { chips: { blue: 1 } });
game.player = [{ rank: "K" }, { rank: "Q" }];
game.dealer = [{ rank: "9" }, { rank: "8" }];
game.stood = { player: true, dealer: true };
const result = game.settle();
assert.deepEqual(result.deltas, { player: 200, dealer: -500 });
assert.deepEqual(result.returns.player, { red: 4, blue: 0, black: 0 });
assert.deepEqual(game.chips, { player: 3200, dealer: 2500 });

const debtGame = new CasinoDuelGame();
debtGame.startMatch();
debtGame.startRound("player");
debtGame.setBet("player", { chips: { red: 5, blue: 3, black: 1 } });
debtGame.setBet("dealer", { chips: { red: 1 } });
debtGame.player = [{ rank: "K" }, { rank: "9" }, { rank: "5" }];
debtGame.dealer = [{ rank: "K" }, { rank: "Q" }];
const loss = debtGame.settle();
assert.equal(loss.grossDeltas.player, -3000);
assert.equal(debtGame.chips.player, 0);
debtGame.takeLoan("player");
assert.deepEqual({ chips: debtGame.chips.player, debt: debtGame.debts.player }, { chips: 500, debt: 500 });
debtGame.phase = "playing";
debtGame.setBet("player", { chips: { blue: 1 } });
debtGame.player = [{ rank: "K" }, { rank: "Q" }];
debtGame.dealer = [{ rank: "9" }, { rank: "8" }];
const repayment = debtGame.settle();
assert.equal(repayment.grossDeltas.player, 500);
assert.equal(repayment.repayments.player, 500);
assert.deepEqual({ chips: debtGame.chips.player, debt: debtGame.debts.player }, { chips: 500, debt: 0 });

host.close();
await new Promise((resolve) => setTimeout(resolve, 100));
const returning = new Client();
await returning.open();
returning.send({ type: "join", token: hostToken });
const returnedWelcome = await returning.next("welcome");
assert.equal(returnedWelcome.id, hostId);
assert.equal(returnedWelcome.account.name, "ACE");
assert.equal(returnedWelcome.account.chips, 600);
assert.equal(returnedWelcome.account.debt, 100);
returning.close();
guest.close();
console.log("integration: persistent account, physical chip betting, pairing, and debt repayment passed");
