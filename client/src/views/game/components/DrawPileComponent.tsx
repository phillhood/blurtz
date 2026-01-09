import React from "react";
import { PileLabel } from "@styles";
import { Pile } from "@types";
import { CardPile, FannedCards, EmptyPile } from ".";

interface DrawPileComponentProps {
  pile: Pile;
  onPileClick: () => void;
  canFlip: boolean;
  isDraggable: boolean;
  playerId?: string;
  isCurrentPlayer?: boolean;
  pendingMoveCardIds?: Set<string>;
}

/**
 * Draw Pile component with two areas:
 * 1. Draw pile (left) - face-down cards to be drawn
 * 2. Fanned area (right) - face-up active cards (last one is playable)
 */
const DrawPileComponent: React.FC<DrawPileComponentProps> = ({
  pile,
  onPileClick,
  canFlip,
  isDraggable,
  isCurrentPlayer = false,
  pendingMoveCardIds,
}) => {
  // Guard against undefined pile (can happen during game state transitions)
  if (!pile) {
    return null;
  }

  const cards = pile.cards;

  // Array structure: [draw pile (face-down at front)][active pile (face-up at end)]
  // Draw pile = face-down cards at front of array
  const drawPileCards = cards.filter((c) => !c.faceUp);

  // Active cards = face-up cards at end (last one is playable)
  const faceUpCards = cards.filter((c) => c.faceUp);

  const hasDrawPile = drawPileCards.length > 0;
  const hasFlippedCards = faceUpCards.length > 0;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <PileLabel>Draw</PileLabel>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        {/* Left: Draw pile (face-down) */}
        <div
          style={{
            paddingTop: "8px",
          }}
        >
          <div
            onClick={onPileClick}
            style={{
              position: "relative",
              cursor: canFlip ? "pointer" : "default",
              width: "88px",
              height: "118px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {hasDrawPile ? (
              <CardPile
                cards={drawPileCards.map((c) => ({ ...c, faceUp: false }))}
                pileId={`${pile.id}-draw`}
                isDraggable={false}
                maxStackDisplay={2}
                stackOffset={4}
                hideCountBadge
              />
            ) : (
              <EmptyPile
                label={isCurrentPlayer ? "Click to reset" : ""}
                size="small"
              />
            )}
          </div>
        </div>

        {/* Right area: Fanned cards (discards base + active fanned) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: "8px",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "90px",
              height: "126px",
            }}
          >
            {hasFlippedCards ? (
              <FannedCards
                cards={faceUpCards}
                pileId={pile.id}
                isDraggable={isDraggable}
                maxDisplay={3}
                fanOffsetX={6}
                fanOffsetY={6}
                pendingMoveCardIds={pendingMoveCardIds}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <EmptyPile
                  label=""
                  size="small"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawPileComponent;
