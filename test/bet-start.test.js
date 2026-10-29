import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CasinoDuelGame } from '../dist/js/game.js';

const source = readFileSync(new URL('../dist/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('confirmed bet proceeds through account rendering, dealing and enabling actions with the actual page IDs', async () => {
  const els = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, { textContent: '', hidden: true }]));
  const game = new CasinoDuelGame();
  game.startMatch();
  const account = { name: 'YOU', playerId: 1, chips: 3000, stats: {} };
  let dealt = false, enabled = false;
  const context = vm.createContext({
    game, ui: { els, requestBet: async () => ({ chips: { red: 1 } }),
      runCoinToss: async () => 'player',
      prepareRound: () => { els['player-win-payout'].textContent = `勝利時 ${game.winPayoutFor('player')}`; },
      dealInitial: async () => { assert.equal(game.player.length, 2); assert.equal(game.dealer.length, 2); dealt = true; } },
    matchService: { account, saveProgress: () => {} },
    onlineRole: null, matchInterrupted: false, turnSerial: 0, turnRemaining: 0, busy: false, cpuSpecialUsed: false,
    TURN_LIMIT_MS: 30000, stopTurnTimer: () => {}, isOnlineHost: () => false,
    useSpecial: () => {}, syncState: () => {}, enterTurn: async () => { enabled = true; }, trackRank: () => {}, structuredClone,
  });
  vm.runInContext([
    extract('function renderAccount()', 'function showAccountCreation()'),
    extract('function profileFromGame(actor)', 'function resultForGuest(result)'),
    extract('async function beginRound()', 'async function enterTurn('),
  ].join('\n'), context);
  await vm.runInContext('beginRound()', context);
  assert.equal(dealt, true);
  assert.equal(enabled, true);
  assert.equal(game.phase, 'playing');
  assert.equal(els['player-win-payout'].textContent, '勝利時 200');
  assert.equal(els['home-player-name'].textContent, 'YOU');
});
