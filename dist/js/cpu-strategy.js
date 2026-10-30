import { scoreHand } from "./deck.js";

const positionValue = (own, opponent) => {
  const ownScore = scoreHand(own).total;
  const opponentScore = scoreHand(opponent).total;
  return (ownScore <= 21 ? ownScore : -30 - ownScore) +
    (opponentScore > 21 ? 28 : -opponentScore) * 0.45;
};

// A swap is optional: keeping the current hand is also a candidate.
export function bestSwap(cards, opponentCards) {
  let best = null;
  let value = positionValue(cards, opponentCards);
  for (const ownCard of cards) {
    for (const opponentCard of opponentCards) {
      const ownAfter = cards.map(card => card.id === ownCard.id ? opponentCard : card);
      if (scoreHand(ownAfter).total > 21) continue;
      const opponentAfter = opponentCards.map(card => card.id === opponentCard.id ? ownCard : card);
      const nextValue = positionValue(ownAfter, opponentAfter);
      if (nextValue <= value) continue;
      value = nextValue;
      best = { actorCardId: ownCard.id, opponentCardId: opponentCard.id };
    }
  }
  return best;
}
