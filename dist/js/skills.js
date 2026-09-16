export const SPECIALS = [
  { id: "double", icon: "Ⅱ", name: "DOUBLE BET", short: "BET × 2", description: "このラウンドの勝負額を200チップにする。" },
  { id: "reverse", icon: "↻", name: "REVERSE", short: "REDRAW", description: "相手が最後に引いたカードを山札から引き直させる。" },
  { id: "shield", icon: "◇", name: "SHIELD", short: "LOSS −100", description: "負けたときに奪われるチップを100減らす。" },
  { id: "peek", icon: "◉", name: "FUTURE SIGHT", short: "NEXT CARD", description: "次に自分が引くカードを先に確認できる。" },
  { id: "selectReverse", icon: "✦", name: "SELECT REVERSE", short: "SELECT & DROP", description: "相手の手札を公開し、選んだ1枚を捨てる。" },
  { id: "triple", icon: "Ⅲ", name: "TRIPLE BET", short: "BET × 3", description: "このラウンドの勝負額を300チップにする。" },
  { id: "shuffle", icon: "⇄", name: "SHUFFLE", short: "SWAP HANDS", description: "自分と相手の手札をすべて交換する。" },
  { id: "steal", icon: "♜", name: "STEAL", short: "STEAL 50", description: "相手からその場で50チップ奪う。" },
  { id: "extraDraw", icon: "+1", name: "EXTRA DRAW", short: "DRAW & DROP", description: "カードを1枚引いた後、自分の手札から1枚選んで捨てる。" },
  { id: "lock", icon: "⊘", name: "LOCK", short: "SEAL SKILL", description: "相手の次のターンだけ必殺技を封印する。" },
];

export function getSpecial(id) {
  return SPECIALS.find((special) => special.id === id);
}

export function dealSpecials() {
  const pool = [...SPECIALS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return { player: pool.slice(0, 3), dealer: pool.slice(3, 6) };
}
