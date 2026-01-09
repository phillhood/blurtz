import React from "react";
import { Card as CardType } from "@types";
import { Card } from ".";

interface FannedCardsProps {
  /** Array of face-up cards to fan out (last card is top/playable) */
  cards: CardType[];
  /** Pile ID for drag/drop */
  pileId: string;
  /** Whether the top card can be dragged */
  isDraggable?: boolean;
  /** Max cards to display fanned (default 3) */
  maxDisplay?: number;
  /** Horizontal offset between cards in pixels (default 15) */
  fanOffsetX?: number;
  /** Vertical offset between cards in pixels (default 0) */
  fanOffsetY?: number;
  /** Drop handler for top card */
  onDrop?: (card: CardType) => void;
  /** Validates if a card can be dropped on top card */
  canDrop?: (card: CardType) => boolean;
  /** Card IDs pending a move (hidden until game state updates) */
  pendingMoveCardIds?: Set<string>;
}

/**
 * Displays cards fanned out horizontally/vertically.
 * Used for wood pile flipped cards display.
 * Cards array should have playable card at the END (index -1).
 */
const FannedCards: React.FC<FannedCardsProps> = ({
  cards,
  pileId,
  isDraggable = false,
  maxDisplay = 3,
  fanOffsetX = 15,
  fanOffsetY = 0,
  onDrop,
  canDrop,
  pendingMoveCardIds,
}) => {
  if (cards.length === 0) {
    return null;
  }

  // Get the last N cards to display (most recent flips)
  const displayCards = cards.slice(-maxDisplay);
  const cardCount = displayCards.length;

  return (
    <div style={{ position: "relative" }}>
      {displayCards.map((card, index) => {
        const isTopCard = index === cardCount - 1;
        // Cards stack from top-left to bottom-right (top card most down-right)

        return (
          <div
            key={card.id}
            style={{
              position: isTopCard ? "relative" : "absolute",
              left: index * fanOffsetX,
              top: index * fanOffsetY,
              zIndex: index + 1,
            }}
          >
            <Card
              card={card}
              pileId={pileId}
              isDraggable={isDraggable && isTopCard}
              onDrop={isTopCard ? onDrop : undefined}
              canDrop={isTopCard ? canDrop : undefined}
              isPendingMove={pendingMoveCardIds?.has(card.id) ?? false}
            />
          </div>
        );
      })}
    </div>
  );
};

export default FannedCards;
