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
host.send({ type: "join" });
guest.send({ type: "join" });
const hostId = (await host.next("welcome")).id;
const guestId = (await guest.next("welcome")).id;
assert.notEqual(hostId, guestId);

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
game.startRound("dealer");
const swapped = game.snapshot({ swapSeats: true });
assert.equal(swapped.actor, "player");
assert.deepEqual(swapped.player, game.dealer);
assert.deepEqual(swapped.chips, { player: game.chips.dealer, dealer: game.chips.player });
game.setBet("player", { amount: 500, multiplier: 1 });
game.setBet("dealer", { amount: 100, multiplier: 3 });
game.player = [{ rank: "K" }, { rank: "Q" }];
game.dealer = [{ rank: "9" }, { rank: "8" }];
game.stood = { player: true, dealer: true };
const result = game.settle();
assert.deepEqual(result.deltas, { player: 500, dealer: -300 });
assert.deepEqual(game.chips, { player: 1000, dealer: 200 });

host.close();
guest.close();
console.log("integration: pairing, bet/rematch relay, seat swap, and independent settlement passed");
