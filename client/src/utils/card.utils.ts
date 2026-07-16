import { CardColor, ClientCard, VisibleCard } from "@types";

/**
 * Narrow a card to one whose face you may read.
 *
 * A type predicate rather than a bare `c.faceUp` so that `filter` carries the
 * narrowing with it - `cards.filter(isVisibleCard)` yields `VisibleCard[]`,
 * where a plain arrow yields `ClientCard[]` and every read downstream has to
 * re-prove itself.
 */
export const isVisibleCard = (card: ClientCard): card is VisibleCard =>
  card.faceUp;

export const getCardColorString = (color: CardColor): string => {
  return color.code || color.name || "#000000";
};

export const getCardDisplayColor = (color: CardColor): string => {
  const colorName = color.name?.toLowerCase();
  switch (colorName) {
    case "red":
      return "#dc2626";
    case "blue":
      return "#2563eb";
    case "green":
      return "#16a34a";
    case "yellow":
      return "#ca8a04";
    default:
      return "#000000";
  }
};
