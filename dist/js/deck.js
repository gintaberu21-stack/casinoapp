export const SUITS = [
  { symbol: "♠", color: "black" },
  { symbol: "♥", color: "red" },
  { symbol: "♦", color: "red" },
  { symbol: "♣", color: "black" },
];

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck() {
  const cards = SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${suit.symbol}-${rank}-${Math.random().toString(36).slice(2)}`, rank, ...suit })),
  );
  return shuffle(cards);
}

export function shuffle(cards) {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function scoreHand(cards) {
  let total = 0;
  let aces = 0;
  cards.forEach(({ rank }) => {
    if (rank === "A") { total += 11; aces += 1; }
    else if (["J", "Q", "K"].includes(rank)) total += 10;
    else total += Number(rank);
  });
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}
