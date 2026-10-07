import { INITIAL_POINTS, settleBets, betDefinition, numberColor, INSIDE_BETS, ROLL_DURATION, ballRollTarget, ballRollFrame } from './roulette.js';
import { createRouletteWheel } from './roulette-wheel.js';
import { ROULETTE_HELP } from './roulette-help.js';
import { CHIP_TYPES } from './game.js';
const $ = id => document.getElementById(id);
const rouletteChipTypes = ['red', 'blue', 'black'];
const chipColorFor = id => {
  const lastStake = moves.findLast(move => move.id === id)?.stake ?? 100;
  return rouletteChipTypes.find(type => CHIP_TYPES[type].value === lastStake) ?? 'red';
};
document.querySelector('.chip-choices').replaceChildren(...rouletteChipTypes.map(type => {
  const button = document.createElement('button'); button.type = 'button';
  button.dataset.stake = CHIP_TYPES[type].value; button.dataset.chipColor = type;
  button.textContent = CHIP_TYPES[type].value.toLocaleString('ja-JP');
  button.setAttribute('aria-label', `${CHIP_TYPES[type].label} ${CHIP_TYPES[type].value} チップ`);
  return button;
}));
const walletDelta = document.createElement('span');
walletDelta.id = 'wallet-delta'; walletDelta.hidden = true;
walletDelta.setAttribute('role', 'status'); walletDelta.setAttribute('aria-live', 'polite');
document.querySelector('.header-wallet').append(walletDelta);
$('help').innerHTML = ROULETTE_HELP;
$('help').setAttribute('aria-labelledby', 'roulette-help-title');
const storageKey = 'festival-number-wheel-practice-v1';
let balance = INITIAL_POINTS;
try { const value = Number(sessionStorage.getItem(storageKey) ?? INITIAL_POINTS); if (Number.isSafeInteger(value) && value >= 0) balance = value; } catch {}
let stake = CHIP_TYPES.red.value, busy = false, rotation = 0, ballAngle = 0, displayedBalance = balance, deltaTimer;
function hideWalletDelta() {
  clearTimeout(deltaTimer); walletDelta.hidden = true; walletDelta.textContent = '';
  $('balance').classList.remove('chip-gain', 'chip-loss');
}
let bets = {}, moves = [];
const recent = [];
const totalBet = () => Object.values(bets).reduce((sum, value) => sum + value, 0);
const save = () => { try { sessionStorage.setItem(storageKey, String(balance)); } catch {} };
$('wheel').replaceChildren(createRouletteWheel());
function addBetButton(parent, id, label, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.bet = id; button.className = `bet-cell ${className}`;
  const name = document.createElement('span'); name.textContent = label;
  const chip = document.createElement('span'); chip.className = 'placed-chip'; chip.hidden = true;
  button.append(name, chip); button.setAttribute('aria-label', `${label} にベット`);
  button.addEventListener('click', () => placeBet(id));
  parent.append(button); return button;
}
function placeBet(id) {
  if (busy) return;
  if (id.startsWith('n:') && bets[id]) {
    delete bets[id]; moves = moves.filter(move => move.id !== id); render(); return;
  }
  if (totalBet() + stake > balance) { $('result').textContent = '残りポイントが不足しています。チップを変更するか、ベットを戻してください。'; return; }
  document.querySelectorAll('.last-winner').forEach(cell => cell.classList.remove('last-winner'));
  bets[id] = (bets[id] ?? 0) + stake; moves.push({ id, stake }); render();
}
function cancelBet(id) {
  if (busy || !bets[id]) return;
  delete bets[id];
  moves = moves.filter(move => move.id !== id);
  render();
}
const zeros = document.createElement('div'); zeros.className = 'zero-stack'; zeros.style.gridArea = '1 / 1 / 4 / 2'; $('number-grid').append(zeros);
addBetButton(zeros, 'n:00', '00', 'green zero-cell');
addBetButton(zeros, 'n:0', '0', 'green zero-cell');
for (let column = 0; column < 12; column++) for (let row = 0; row < 3; row++) {
  const number = column * 3 + 3 - row;
  const cell = addBetButton($('number-grid'), `n:${number}`, String(number), numberColor(number));
  cell.style.gridArea = `${row + 1} / ${column + 2}`;
}
for (let row = 0; row < 3; row++) {
  const cell = addBetButton($('number-grid'), `column:${3 - row}`, '2:1', 'column-cell'); cell.style.gridArea = `${row + 1} / 14`; cell.setAttribute('aria-label', `${3-row}列目にベット（3倍）`);
}
for (let group = 1; group <= 3; group++) addBetButton($('dozens'), `dozen:${group}`, `${['1st','2nd','3rd'][group-1]} 12`);
for (const [id,label,color] of [['low','1 – 18',''],['even','EVEN',''],['red','赤 / RED','red'],['black','黒 / BLACK','black'],['odd','ODD',''],['high','19 – 36','']]) addBetButton($('outside'), id, label, color);
function updateInsideOptions() {
  $('inside-group').replaceChildren(...INSIDE_BETS[$('inside-kind').value].map(bet => {
    const option = document.createElement('option'); option.value = bet.id;
    option.textContent = `${bet.numbers.join('・')} （${bet.multiplier}倍）`; return option;
  }));
}
$('inside-kind').addEventListener('change', updateInsideOptions);
$('inside-add').addEventListener('click', () => placeBet($('inside-group').value));
updateInsideOptions();
const insideChipLayer = document.createElement('div');
insideChipLayer.className = 'inside-chip-layer';
$('number-grid').append(insideChipLayer);
function renderInsideChips() {
  const grid = $('number-grid').getBoundingClientRect();
  insideChipLayer.replaceChildren();
  for (const [id, amount] of Object.entries(bets)) {
    const definition = Object.values(INSIDE_BETS).flat().find(bet => bet.id === id);
    if (!definition) continue;
    const rects = definition.numbers.map(number => document.querySelector(`[data-bet="n:${number}"]`).getBoundingClientRect());
    const centers = rects.map(rect => ({x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2}));
    let x = centers.reduce((sum,p)=>sum+p.x,0)/centers.length;
    let y = centers.reduce((sum,p)=>sum+p.y,0)/centers.length;
    if (id.startsWith('street:') || id.startsWith('line:')) y = grid.bottom;
    if (id.startsWith('five:')) { x = rects[0].right; y = grid.bottom; }
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'placed-chip combination-chip';
    chip.textContent = amount; chip.title = `${definition.numbers.join('・')}：${amount} PT`;
    chip.dataset.chipColor = chipColorFor(id);
    chip.setAttribute('aria-label', `${chip.title}、タップして取り消す`);
    chip.disabled = busy;
    chip.addEventListener('click', () => cancelBet(id));
    chip.style.left = `${x-grid.left}px`; chip.style.top = `${y-grid.top}px`;
    insideChipLayer.append(chip);
  }
}
new ResizeObserver(renderInsideChips).observe($('number-grid'));
function render() {
  $('balance').textContent = (busy ? displayedBalance : balance).toLocaleString('ja-JP');
  $('bet-total').textContent = `${totalBet().toLocaleString('ja-JP')} PT`;
  const activeDefinitions = Object.keys(bets).map(betDefinition);
  document.querySelectorAll('[data-bet]').forEach(button => {
    button.disabled = busy;
    const amount = bets[button.dataset.bet] ?? 0;
    const id = button.dataset.bet;
    const number = id === 'n:00' ? '00' : Number(id.slice(2));
    const covered = id.startsWith('n:') && activeDefinitions.some(definition => definition.matches(number));
    button.classList.toggle('bet-covered', covered || amount > 0);
    const chip = button.querySelector('.placed-chip'); chip.hidden = !amount; chip.textContent = amount;
    chip.dataset.chipColor = chipColorFor(id);
    button.setAttribute('aria-label', `${button.firstChild.textContent} にベット${amount ? `、現在 ${amount} PT` : ''}`);
  });
  document.querySelectorAll('[data-stake]').forEach(button => { button.disabled = busy; button.setAttribute('aria-pressed', String(Number(button.dataset.stake) === stake)); });
  $('spin').disabled = busy || !totalBet(); $('spin').textContent = busy ? 'ボールが回転中…' : totalBet() ? 'SPIN · 回す' : 'チップを置いてください';
  $('undo').disabled = $('clear').disabled = busy || !moves.length; $('reset').disabled = busy;
  $('inside-kind').disabled = $('inside-group').disabled = $('inside-add').disabled = busy;
  $('inside-add').textContent = `${stake} PTを置く`;
  const multi = Object.entries(bets).filter(([id]) => !id.startsWith('n:') && !['red','black','even','odd','low','high'].includes(id) && !id.startsWith('dozen:') && !id.startsWith('column:'));
  $('inside-placed').replaceChildren(...multi.map(([id,amount])=>{
    const node = document.createElement('span'); node.textContent = `${id.slice(id.indexOf(':')+1).replaceAll('-','・')}：${amount} PT`; return node;
  }));
  renderInsideChips();
}
document.querySelectorAll('[data-stake]').forEach(button => button.addEventListener('click', () => { if (!busy) { stake = Number(button.dataset.stake); render(); } }));
$('undo').addEventListener('click', () => { if (busy || !moves.length) return; const move = moves.pop(); bets[move.id] -= move.stake; if (!bets[move.id]) delete bets[move.id]; render(); });
$('clear').addEventListener('click', () => { if (busy) return; bets = {}; moves = []; render(); });
$('spin').addEventListener('click', async () => {
  if (busy || !totalBet()) return;
  const result = settleBets(balance, bets);
  hideWalletDelta();
  displayedBalance = balance;
  busy = true; balance = result.balance; save();
  $('result').classList.remove('is-win'); $('result').textContent = 'ボールがポケットに入るまでお待ちください';
  $('ball-orbit').classList.remove('is-settled');
  document.querySelectorAll('.last-winner').forEach(cell => cell.classList.remove('last-winner'));
  $('status').textContent = 'NO MORE BETS'; render();
  $('spin').blur();
  requestAnimationFrame(() => {
    document.querySelector('.wheel-game').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  const target = ballRollTarget(rotation, ballAngle, result.number), wheelStart = rotation, ballStart = ballAngle;
  await new Promise(resolve => {
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / ROLL_DURATION), motion = ballRollFrame(progress, wheelStart, ballStart, target);
      $('wheel').style.transform = `rotate(${motion.wheel}deg)`; $('ball-orbit').style.transform = `rotate(${motion.ball}deg)`; $('ball-orbit').style.setProperty('--ball-radius', `${motion.radius}%`);
      if (progress < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
  rotation = target.wheelEnd; ballAngle = target.ballEnd;
  $('ball-orbit').classList.add('is-settled'); $('status').textContent = `RESULT · ${result.number}`;
  recent.unshift(result.number); recent.splice(3);
  $('history').replaceChildren(...recent.map(number => { const node = document.createElement('span'); node.className = numberColor(number); node.textContent = number; return node; }));
  document.querySelector(`[data-bet="n:${result.number}"]`).classList.add('last-winner');
  $('result').replaceChildren();
  walletDelta.textContent = `${result.delta >= 0 ? '＋' : '−'}${Math.abs(result.delta).toLocaleString('ja-JP')}`;
  walletDelta.className = result.delta > 0 ? 'delta-positive' : result.delta < 0 ? 'delta-negative' : 'delta-neutral';
  walletDelta.hidden = result.delta === 0;
  const balanceRect = $('balance').getBoundingClientRect();
  walletDelta.style.setProperty('--chip-x', `${Math.min(innerWidth - 65, Math.max(65, balanceRect.left + balanceRect.width / 2))}px`);
  walletDelta.style.setProperty('--chip-y', `${balanceRect.bottom + 34}px`);
  if (result.delta) $('balance').classList.add(result.delta > 0 ? 'chip-gain' : 'chip-loss');
  const balanceStart = displayedBalance;
  await new Promise(resolve => {
    const started = performance.now();
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 990;
    function updateBalance(now) {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      displayedBalance = Math.round(balanceStart + (balance - balanceStart) * (Math.ceil(progress * 18) / 18));
      $('balance').textContent = displayedBalance.toLocaleString('ja-JP');
      if (progress < 1) requestAnimationFrame(updateBalance); else resolve();
    }
    requestAnimationFrame(updateBalance);
  });
  setTimeout(() => $('balance').classList.remove('chip-gain', 'chip-loss'), 250);
  deltaTimer = setTimeout(hideWalletDelta, 2200);
  bets = {}; moves = []; busy = false; render();
});
$('reset').addEventListener('click', () => { if (busy) return; hideWalletDelta(); balance = INITIAL_POINTS; bets = {}; moves = []; save(); $('result').textContent = '練習ポイントを1,000 PTに戻しました'; $('result').classList.remove('is-win'); render(); });
$('help-open').addEventListener('click', () => $('help').showModal());
$('help').querySelector('.close').addEventListener('click', () => $('help').close());
$('help').addEventListener('click', event => { if (event.target === $('help')) $('help').close(); });
render();
