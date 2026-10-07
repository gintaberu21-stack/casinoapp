export const INITIAL_POINTS = 1000;
export const NUMBER_COUNT = 36;
export const POCKET_ANGLE = 360 / NUMBER_COUNT;
export const STAKES = [10, 50, 100];
export const WHEEL_ORDER = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];
export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const numberColor = number => number === 0 || number === '00' ? 'green' : RED_NUMBERS.has(number) ? 'red' : 'black';

export const INSIDE_BETS = { split: [], street: [], corner: [], five: [], line: [] };
function addInside(kind, numbers, multiplier) {
  INSIDE_BETS[kind].push({ id: `${kind}:${numbers.join('-')}`, numbers, multiplier });
}
for (let n = 1; n <= 36; n++) {
  if (n % 3 !== 0) addInside('split', [n,n+1], 18);
  if (n <= 33) addInside('split', [n,n+3], 18);
  if (n <= 32 && n % 3 !== 0) addInside('corner', [n,n+1,n+3,n+4], 9);
}
for (let n = 1; n <= 34; n += 3) {
  addInside('street', [n,n+1,n+2], 12);
  if (n <= 31) addInside('line', [n,n+1,n+2,n+3,n+4,n+5], 6);
}
for (const numbers of [[0,'00'],[0,1],[0,2],['00',2],['00',3]]) addInside('split', numbers, 18);
addInside('five', [0,'00',1,2,3], 7);
const insideById = new Map(Object.values(INSIDE_BETS).flat().map(bet => [bet.id, bet]));

export function drawPocket(fill = bytes => crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(1);
  do { fill(bytes); } while (bytes[0] >= 228);
  return WHEEL_ORDER[bytes[0] % WHEEL_ORDER.length];
}

export function betDefinition(id) {
  if (id === 'n:00') return { multiplier: 36, matches: outcome => outcome === '00' };
  if (insideById.has(id)) {
    const bet = insideById.get(id);
    return { multiplier: bet.multiplier, matches: outcome => bet.numbers.includes(outcome) };
  }
  if (/^n:(?:[0-9]|[12][0-9]|3[0-6])$/.test(id)) {
    const number = Number(id.slice(2));
    return { multiplier: 36, matches: outcome => outcome === number };
  }
  const definitions = {
    red: [2, n => RED_NUMBERS.has(n)], black: [2, n => n > 0 && !RED_NUMBERS.has(n)],
    even: [2, n => n > 0 && n % 2 === 0], odd: [2, n => n % 2 === 1],
    low: [2, n => n >= 1 && n <= 18], high: [2, n => n >= 19 && n <= 36],
  };
  if (/^dozen:[1-3]$/.test(id)) {
    const group = Number(id.slice(-1));
    return { multiplier: 3, matches: n => n > (group - 1) * 12 && n <= group * 12 };
  }
  if (/^column:[1-3]$/.test(id)) {
    const column = Number(id.slice(-1));
    return { multiplier: 3, matches: n => n > 0 && (n - 1) % 3 + 1 === column };
  }
  if (!definitions[id]) throw new Error('ベットが不正です');
  return { multiplier: definitions[id][0], matches: definitions[id][1] };
}

export function settleBets(balance, bets, number = drawPocket()) {
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('残高が不正です');
  if (!WHEEL_ORDER.includes(number)) throw new Error('出目が不正です');
  const entries = Object.entries(bets);
  if (!entries.length) throw new Error('チップを置いてください');
  let total = 0, payout = 0;
  const winningBets = [];
  for (const [id, amount] of entries) {
    const definition = betDefinition(id);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 10) throw new Error('ベット額が不正です');
    total += amount;
    if (definition.matches(number)) { payout += amount * definition.multiplier; winningBets.push(id); }
  }
  if (!Number.isSafeInteger(total) || total > balance) throw new Error('ポイントが不足しています');
  if (!Number.isSafeInteger(balance - total + payout)) throw new Error('ポイント上限を超えています');
  return { number, total, payout, delta: payout - total, balance: balance - total + payout, winningBets };
}

// 252未満だけを採用し、36個の数字への剰余に偏りが出ないようにする。
export function drawNumber(fill = bytes => crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(1);
  do { fill(bytes); } while (bytes[0] >= 252);
  return bytes[0] % NUMBER_COUNT + 1;
}

export function playRound(balance, choice, stake, number = drawNumber()) {
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('残高が不正です');
  if (!Number.isInteger(choice) || choice < 1 || choice > NUMBER_COUNT) throw new Error('数字を選んでください');
  if (!STAKES.includes(stake) || stake > balance) throw new Error('ポイントが不足しています');
  if (!Number.isInteger(number) || number < 1 || number > NUMBER_COUNT) throw new Error('出目が不正です');
  const win = choice === number;
  const payout = win ? stake * NUMBER_COUNT : 0;
  return { number, choice, stake, win, payout, delta: payout - stake, balance: balance - stake + payout };
}

export function rotationFor(current, number) {
  const target = (360 - (number - .5) * POCKET_ANGLE) % 360;
  return current + 360 * 10 + ((target - current % 360 + 360) % 360);
}

export const ROLL_DURATION = 10000;
export function ballRollTarget(wheelAngle, ballAngle, number) {
  const wheelEnd = wheelAngle + 360 * 5 + 70;
  const index = WHEEL_ORDER.indexOf(number);
  if (index < 0) throw new Error('出目が不正です');
  const pocketAngle = wheelEnd + (index + .5) * 360 / WHEEL_ORDER.length;
  const correction = ((ballAngle - pocketAngle) % 360 + 360) % 360;
  return { wheelEnd, ballEnd: ballAngle - 360 * 8 - correction };
}

export function ballRollFrame(progress, wheelStart, ballStart, target) {
  const t = Math.max(0, Math.min(1, progress));
  const wheelEase = 1 - (1 - t) ** 2;
  const ballEase = 1 - (1 - t) ** 3;
  const drop = Math.max(0, Math.min(1, (t - .65) / .28));
  const dropEase = drop * drop * (3 - 2 * drop);
  return {
    wheel: wheelStart + (target.wheelEnd - wheelStart) * wheelEase,
    ball: ballStart + (target.ballEnd - ballStart) * ballEase,
    radius: 46 - 13 * dropEase + Math.sin(drop * Math.PI * 6) * 1.3 * (1 - drop) * (drop > 0 ? 1 : 0),
  };
}
