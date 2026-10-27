import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../dist/js/app.js", import.meta.url), "utf8");
const progress = app.slice(app.indexOf("function persistProgress("), app.indexOf("function resultForGuest("));
const finish = app.slice(app.indexOf("async function finishRound("), app.indexOf("function refreshResultBalances("));

for (const mode of ["duo", "solo", "online"]) {
  test(`${mode}: result persistence respects the shared-device boundary`, async () => {
    const calls = [];
    const result = { matchComplete: true, round: 3, matchOutcome: "win", chips: { player: 6000, dealer: 1000 } };
    const context = vm.createContext({
      game: { mode, phase: "playing", actor: "player", chips: result.chips, inventories: {}, settle: () => result },
      busy: false, matchInterrupted: false, onlineRole: mode === "online" ? "host" : null, recordMatchId: "match",
      structuredClone, stopTurnTimer() {}, wait: async () => {},
      profileFromGame: () => ({ chips: 6000 }), isOnlineHost: () => mode === "online",
      renderAccount: () => calls.push("render"),
      matchService: { saveRoundResult: () => calls.push("round-gain"), saveProgress: () => calls.push("progress"), saveResult: () => calls.push("result") },
      recordBlackjackRound: () => calls.push("round-record"),
      recordBlackjackMatch: () => calls.push("match-record"),
      resolveDebtChoices: async () => true, refreshResultBalances: () => {},
      syncState: () => {}, ui: {
        els: { "round-status": {} }, setActions() {}, revealDealer: async () => {},
        renderHands() {}, animateChipPayout: async () => {}, animateChipChange: async () => {},
        showResult: () => calls.push("show-result"),
      },
    });
    vm.runInContext(progress + "\n" + finish, context);
    vm.runInContext("persistProgress(true)", context);
    await vm.runInContext("finishRound()", context);
    assert.ok(calls.includes("show-result"));
    for (const action of ["progress", "result", "round-record", "match-record", "round-gain"])
      assert.equal(calls.includes(action), mode !== "duo", action);
  });
}
