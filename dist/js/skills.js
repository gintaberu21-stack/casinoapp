export const SPECIALS = [
  { id: "double", icon: "×2", name: "DOUBLE", short: "BET × 2", description: "この勝負の獲得・損失チップを2倍にする。" },
  { id: "reverse", icon: "↻", name: "REVERSE", short: "REDRAW", description: "ディーラーの伏せカードを1枚引き直させる。" },
  { id: "shield", icon: "◇", name: "SHIELD", short: "BUST GUARD", description: "次のHITでBUSTしたとき、その1枚を無効にする。" },
];

export function getSpecial(id) {
  return SPECIALS.find((special) => special.id === id);
}
