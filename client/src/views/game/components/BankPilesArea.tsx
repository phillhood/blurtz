import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { CenterArea, BankPiles, WorkPile, PileLabel } from "@styles";
import { Card as CardType, Pile } from "@types";
import { CardPile } from ".";
import { DragData } from "./Card";

interface BankPilesAreaProps {
  bankPiles: Pile[];
  canDropOnPile: (pileIndex: number, card: CardType) => boolean;
}

const BankPilesArea: React.FC<BankPilesAreaProps> = ({
  bankPiles,
  canDropOnPile,
}) => {
  // Only show piles with cards
  const activePiles = bankPiles
    .map((pile, index) => ({ pile, index }))
    .filter(({ pile }) => pile.cards.length > 0);

  // Find the first empty pile for the placeholder
  const firstEmptyIndex = bankPiles.findIndex((pile) => pile.cards.length === 0);
  const firstEmptyPile = firstEmptyIndex >= 0 ? bankPiles[firstEmptyIndex] : null;

  return (
    <CenterArea>
      <div style={{ position: "relative" }}>
        <PileLabel style={{ paddingBottom: "8px" }}>Bank</PileLabel>
        <BankPiles>
          {activePiles.map(({ pile, index }) => (
            <WorkPile key={pile.id}>
              <CardPile
                cards={pile.cards}
                pileId={pile.id}
                isDraggable={false}
                onDrop={() => {}}
                canDrop={(card) => canDropOnPile(index, card)}
                maxStackDisplay={2}
                stackOffset={3}
                hideCountBadge
              />
            </WorkPile>
          ))}
          {/* Always show a placeholder for starting new piles */}
          {firstEmptyPile && (
            <WorkPile>
              <EmptyPileDropZone
                pileId={firstEmptyPile.id}
                pileIndex={firstEmptyIndex}
                canDrop={(card) => canDropOnPile(firstEmptyIndex, card)}
              />
            </WorkPile>
          )}
        </BankPiles>
      </div>
    </CenterArea>
  );
};

const EmptyPileDropZone: React.FC<{
  pileId: string;
  pileIndex: number;
  canDrop: (card: CardType) => boolean;
}> = ({ pileId, pileIndex, canDrop }) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `bank-pile-empty-${pileId}`,
    data: { pileId, pileIndex, isEmpty: true },
  });

  // Check if the active card can be dropped here
  const canDropHere = isOver && active
    ? canDrop((active.data.current as DragData)?.card)
    : false;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: "0.8rem",
        fontFamily: "Germania One, sans-serif",
        color: "#94a3b8",
        backgroundColor: canDropHere ? "rgba(16, 185, 129, 0.2)" : "transparent",
        border: canDropHere ? "2px dashed #10b981" : "2px dashed #475569",
        borderRadius: "6px",
      }}
    >
      1
    </div>
  );
};

export default BankPilesArea;
