import { useCallback, useEffect, useState } from "react";
import type { ClientCard } from "@types";

export interface Selection {
  card: ClientCard;
  fromPileId: string;
}

export interface CardSelection {
  selected: Selection | null;
  isSelected(cardId: string): boolean;
  toggle(card: ClientCard, fromPileId: string): void;
  clear(): void;
}

/**
 * The one card a player has picked up by tapping.
 *
 * Cleared whenever new game state arrives, for the same reason
 * `usePendingMoveCards` clears: the board has changed underneath the selection
 * and the card may no longer be on the pile it was taken from, so holding it
 * would aim the next tap at a stale target.
 */
export function useCardSelection(gameState: unknown): CardSelection {
  const [selected, setSelected] = useState<Selection | null>(null);

  const toggle = useCallback((card: ClientCard, fromPileId: string) => {
    if (!card.faceUp) return;
    setSelected((current) =>
      current?.card.id === card.id ? null : { card, fromPileId }
    );
  }, []);

  const clear = useCallback(() => setSelected(null), []);

  useEffect(() => {
    setSelected((current) => (current === null ? current : null));
  }, [gameState]);

  const isSelected = useCallback(
    (cardId: string) => selected?.card.id === cardId,
    [selected]
  );

  return { selected, isSelected, toggle, clear };
}
