// rank A=金 / B=従来の紫 / C=シルバー
export const SPECIALS = [
  { id: "shuffle", rank: "A", icon: "⇄", name: "SHUFFLE", short: "SWAP 1 CARD", description: "相手の手札をすべて公開し、自分と相手から1枚ずつ選んで交換する。" },
  { id: "selectReverse", rank: "A", icon: "✦", name: "SELECT REVERSE", short: "SELECT & DROP", description: "相手の手札を公開し、選んだ1枚を捨てる。" },
  { id: "triple", rank: "A", icon: "Ⅲ", name: "TRIPLE BET", short: "BET × 3", description: "このラウンドの勝負額を3倍にする。" },
  { id: "double", rank: "B", icon: "Ⅱ", name: "DOUBLE BET", short: "BET × 2", description: "このラウンドの勝負額を2倍にする。" },
  { id: "extraDraw", rank: "B", icon: "+1", name: "EXTRA DRAW", short: "DRAW & DROP", description: "カードを1枚引いた後、自分の手札から1枚選んで捨てる。" },
  { id: "lock", rank: "B", icon: "⊘", name: "LOCK", short: "SEAL SKILL", description: "相手の次のターンだけ必殺技を封印する。" },
  { id: "peek", rank: "C", icon: "◉", name: "FUTURE SIGHT", short: "NEXT CARD", description: "次に自分が引くカードを先に確認できる。" },
  { id: "shield", rank: "C", icon: "◇", name: "SHIELD", short: "LOSS −100", description: "負けたときに奪われるチップを100減らす。" },
];

export const RANK_LABELS = { A: "Aランク", B: "Bランク", C: "Cランク" };

export function getSpecial(id) {
  return SPECIALS.find((special) => special.id === id);
}

// 1枚引くごとのランク出現率。Aを絞ってCとBを出やすくする。
export const RANK_WEIGHTS = { A: 0.2, B: 0.4, C: 0.4 };

/** 残っているランクの中から重み付きで1ランク選び、そのランクのカードを1枚抜き出す。 */
function drawByRank(pool) {
  const ranks = ["A", "B", "C"].filter((rank) => pool.some((special) => special.rank === rank));
  if (!ranks.length) return null;
  const total = ranks.reduce((sum, rank) => sum + RANK_WEIGHTS[rank], 0);
  let roll = Math.random() * total;
  const rank = ranks.find((candidate) => (roll -= RANK_WEIGHTS[candidate]) < 0) ?? ranks[ranks.length - 1];
  const candidates = pool.filter((special) => special.rank === rank);
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  pool.splice(pool.indexOf(picked), 1);
  return picked;
}

export function dealSpecials() {
  const pool = [...SPECIALS];
  const player = [];
  const dealer = [];
  // 交互に引いて、どちらかが先に良いカードを取り尽くさないようにする。
  for (let index = 0; index < 3; index += 1) {
    player.push(drawByRank(pool));
    dealer.push(drawByRank(pool));
  }
  return { player: player.filter(Boolean), dealer: dealer.filter(Boolean) };
}
