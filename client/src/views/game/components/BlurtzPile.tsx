import React from "react";
import { BlurtzPile as BlurtzPileStyled, PileLabel } from "@styles";
import { Pile } from "@types";
import { Card, EmptyPile } from ".";

interface BlurtzPileComponentProps {
  pile: Pile;
  onCardClick: () => void;
  isDraggable: boolean;
  pendingMoveCardIds?: Set<string>;
}

const STACK_OFFSET = 4;
const MAX_STACK_DISPLAY = 3;

/**
 * Blurtz Pile - shows top face-up card with face-down cards stacked beneath.
 */
const BlurtzPileComponent: React.FC<BlurtzPileComponentProps> = ({
  pile,
  onCardClick,
  isDraggable,
  pendingMoveCardIds,
}) => {
  // Guard against undefined pile (can happen during game state transitions)
  if (!pile) {
    return null;
  }

  const topCard = pile.cards.length > 0 ? pile.cards[pile.cards.length - 1] : null;
  const stackCount = Math.min(pile.cards.length - 1, MAX_STACK_DISPLAY);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <PileLabel>Blurtz</PileLabel>
      <div style={{ paddingTop: "8px" }}>
        <BlurtzPileStyled>
          {topCard ? (
            <div style={{ position: "relative" }}>
              {/* Face-down cards beneath (visual depth indicator) */}
              {Array.from({ length: stackCount }).map((_, index) => (
                <div
                  key={`stack-${index}`}
                  style={{
                    position: "absolute",
                    top: index * STACK_OFFSET,
                    left: index * STACK_OFFSET,
                    zIndex: index,
                    pointerEvents: "none",
                  }}
                >
                  <Card
                    card={{ ...pile.cards[index], faceUp: false }}
                    pileId={pile.id}
                    isDraggable={false}
                  />
                </div>
              ))}

              {/* Top card (face-up, interactive) */}
              <div
                style={{
                  position: "relative",
                  top: stackCount * STACK_OFFSET,
                  left: stackCount * STACK_OFFSET,
                  zIndex: stackCount + 1,
                }}
              >
                <Card
                  card={topCard}
                  pileId={pile.id}
                  isDraggable={isDraggable && topCard.faceUp}
                  onClick={onCardClick}
                  isPendingMove={pendingMoveCardIds?.has(topCard.id) ?? false}
                />
              </div>
            </div>
          ) : (
            <EmptyPile label="BLURTZ!" />
          )}
        </BlurtzPileStyled>
      </div>
    </div>
  );
};

export default BlurtzPileComponent;
