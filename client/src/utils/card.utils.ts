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

const CARD_HUE: Record<string, string> = {
  red: "var(--color-card-red)",
  blue: "var(--color-card-blue)",
  yellow: "var(--color-card-yellow)",
  green: "var(--color-card-green)",
};

/**
 * The CSS colour a card is painted in, as a `var()` reference.
 *
 * Keyed on `color.name` because that is what the rules engine matches bank
 * piles on - the domain carries no hex, so the palette lives entirely in the
 * token layer and a repaint never touches `@blurtz/shared` or the database.
 *
 * @returns a `var(--color-card-*)` reference; the unknown-colour token when
 * `name` is not one of the four, which is a bug rather than a state to design
 * for.
 */
export const cardHue = (color: CardColor): string =>
  CARD_HUE[color.name?.toLowerCase()] ?? "var(--color-card-unknown)";
