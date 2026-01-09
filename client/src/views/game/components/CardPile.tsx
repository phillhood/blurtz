import React from "react";
import { Card as CardType } from "@types";
import { Card } from ".";

interface CardPileProps {
  /** Array of cards in the pile (last card is top/visible) */
  cards: CardType[];
  /** Pile ID for drag/drop */
  pileId: string;
  /** Whether the top card can be dragged */
  isDraggable?: boolean;
  /** Click handler for the pile */
  onClick?: () => void;
  /** Drop handler - enables drop zone on top card */
  onDrop?: (card: CardType) => void;
  /** Validates if a card can be dropped */
  canDrop?: (card: CardType) => boolean;
  /** Max number of stacked cards to show behind top card (default 2) */
  maxStackDisplay?: number;
  /** Offset in pixels between stacked cards (default 3) */
  stackOffset?: number;
  /** Show stacked cards face-up (default false) */
  showStackFaceUp?: boolean;
  /** Hide the count badge on top of cards (default false) */
  hideCountBadge?: boolean;
  /** Card IDs pending a move (hidden until game state updates) */
  pendingMoveCardIds?: Set<string>;
}

/**
 * Standardized card pile display component.
 * Shows the top card with stacked cards visible behind it.
 * Cards array should have top card at the END (index -1).
 */
const CardPile: React.FC<CardPileProps> = ({
  cards,
  pileId,
  isDraggable = false,
  onClick,
  onDrop,
  canDrop,
  maxStackDisplay = 2,
  stackOffset = 3,
  showStackFaceUp = false,
  hideCountBadge = false,
  pendingMoveCardIds,
}) => {
  if (cards.length === 0) {
    return null;
  }

  const topCard = cards[cards.length - 1];
  const stackCount = Math.min(cards.length - 1, maxStackDisplay);

  return (
    <div style={{ position: "relative" }}>
      {/* Stacked cards behind (visual only) - at origin, peeking out top-left */}
      {Array.from({ length: stackCount }).map((_, index) => (
        <div
          key={`stack-${index}`}
          style={{
            position: "absolute",
            top: index * stackOffset,
            left: index * stackOffset,
            zIndex: index,
            pointerEvents: "none",
          }}
        >
          <Card
            card={{ ...cards[cards.length - 2 - index], faceUp: showStackFaceUp }}
            pileId={pileId}
            isDraggable={false}
          />
        </div>
      ))}

      {/* Top card (interactive) - offset down-right from stack */}
      <div
        style={{
          position: "relative",
          top: stackCount * stackOffset,
          left: stackCount * stackOffset,
          zIndex: stackCount + 1,
        }}
      >
        <Card
          card={topCard}
          pileId={pileId}
          isDraggable={isDraggable && topCard.faceUp}
          onClick={onClick}
          onDrop={onDrop}
          canDrop={canDrop}
          isPendingMove={pendingMoveCardIds?.has(topCard.id) ?? false}
        />
        {/* Card count badge - positioned on top card */}
        {!hideCountBadge && cards.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: 4,
              right: 4,
              background: "rgba(0,0,0,0.7)",
              color: "white",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "bold",
              zIndex: 1,
            }}
          >
            {cards.length}
          </div>
        )}
      </div>
    </div>
  );
};

export default CardPile;
