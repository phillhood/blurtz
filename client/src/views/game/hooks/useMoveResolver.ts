import { useMemo } from "react";
import { canPlace, cardsMovedBy } from "@blurtz/shared";
import type { ClientCard, Pile, PileType } from "@types";

export interface ResolvedMove {
  toPileId: string;
  toType: PileType;
  movingCardIds: string[];
}

export interface MoveResolver {
  resolve(
    card: ClientCard,
    fromPileId: string,
    toPileId: string
  ): ResolvedMove | null;
  legalTargetIds(card: ClientCard, fromPileId: string): string[];
}

/**
 * The single decision both input paths ask.
 *
 * Drag and tap must never disagree about what is legal, so neither restates a
 * rule: this delegates placement to `canPlace` and stack size to
 * `cardsMovedBy`, the same functions the server runs.
 *
 * @returns `null` from `resolve` when the move is illegal, the destination is
 * unknown, or the destination is the pile the card came from.
 */
export function useMoveResolver(
  bankPiles: Pile[] | undefined,
  workPiles: Pile[] | undefined
): MoveResolver {
  return useMemo(() => {
    const banks = bankPiles ?? [];
    const works = workPiles ?? [];

    const accepts = (pile: Pile, type: PileType, card: ClientCard): boolean => {
      if (!card.faceUp) return false;
      const topCard = pile.cards[pile.cards.length - 1];
      if (topCard && !topCard.faceUp) return false;
      return canPlace(type, topCard, card);
    };

    const movingIds = (
      fromPileId: string,
      cardId: string,
      toType: PileType
    ): string[] => {
      const source = works.find((p) => p.id === fromPileId);
      if (!source) return [cardId];
      const moving = cardsMovedBy("work", toType, source.cards, cardId);
      return moving.length > 0 ? moving.map((c) => c.id) : [cardId];
    };

    const resolve = (
      card: ClientCard,
      fromPileId: string,
      toPileId: string
    ): ResolvedMove | null => {
      if (toPileId === fromPileId) return null;

      const bank = banks.find((p) => p.id === toPileId);
      if (bank) {
        if (!accepts(bank, "bank", card)) return null;
        return {
          toPileId,
          toType: "bank",
          movingCardIds: movingIds(fromPileId, card.id, "bank"),
        };
      }

      const work = works.find((p) => p.id === toPileId);
      if (work) {
        if (!accepts(work, "work", card)) return null;
        return {
          toPileId,
          toType: "work",
          movingCardIds: movingIds(fromPileId, card.id, "work"),
        };
      }

      return null;
    };

    const legalTargetIds = (card: ClientCard, fromPileId: string): string[] =>
      [...banks, ...works]
        .filter((p) => resolve(card, fromPileId, p.id) !== null)
        .map((p) => p.id);

    return { resolve, legalTargetIds };
  }, [bankPiles, workPiles]);
}
