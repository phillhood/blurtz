import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { CenterArea, BankPiles, PileLabel } from "@styles";
import { ClientCard, Pile } from "@types";
import { CardPile } from ".";
import { DragData } from "./Card";

interface BankPilesAreaProps {
  bankPiles: Pile[];
  canDropOnPile: (pileIndex: number, card: ClientCard) => boolean;
  legalTargetIds?: string[];
  onCardTap?: (card: ClientCard, pileId: string) => void;
}

const BankPilesArea: React.FC<BankPilesAreaProps> = ({
  bankPiles,
  legalTargetIds = [],
  onCardTap,
  canDropOnPile,
}) => {
  const activePiles = bankPiles
    .map((pile, index) => ({ pile, index }))
    .filter(({ pile }) => pile.cards.length > 0);

  const firstEmptyIndex = bankPiles.findIndex((pile) => pile.cards.length === 0);
  const firstEmptyPile = firstEmptyIndex >= 0 ? bankPiles[firstEmptyIndex] : null;

  return (
    <CenterArea>
      <div style={{ position: "relative" }}>
        <PileLabel style={{ paddingBottom: "8px" }}>Bank</PileLabel>
        <BankPiles>
          {activePiles.map(({ pile, index }) => (
            <div className="blurtz-slot" data-card-size="foundation" key={pile.id}>
              <CardPile
                cards={pile.cards}
                pileId={pile.id}
                isDraggable={false}
                onDrop={() => {}}
                canDrop={(card) => canDropOnPile(index, card)}
                maxStackDisplay={2}
                stackOffset={3}
                hideCountBadge
                size="foundation"
                isLegalTarget={legalTargetIds.includes(pile.id)}
                onCardTap={onCardTap}
              />
            </div>
          ))}
          {/* Always show a placeholder for starting new piles */}
          {firstEmptyPile && (
            <div className="blurtz-slot" data-card-size="foundation">
              <EmptyPileDropZone
                pileId={firstEmptyPile.id}
                pileIndex={firstEmptyIndex}
                canDrop={(card) => canDropOnPile(firstEmptyIndex, card)}
              />
            </div>
          )}
        </BankPiles>
      </div>
    </CenterArea>
  );
};

const EmptyPileDropZone: React.FC<{
  pileId: string;
  pileIndex: number;
  canDrop: (card: ClientCard) => boolean;
}> = ({ pileId, pileIndex, canDrop }) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `bank-pile-empty-${pileId}`,
    data: { pileId, pileIndex, isEmpty: true },
  });

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
        fontSize: "0.7rem",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        backgroundColor: canDropHere
          ? "rgba(168, 85, 247, 0.12)"
          : "transparent",
        border: canDropHere
          ? "2px dashed var(--color-purple-bright)"
          : "1.5px dashed rgba(255, 255, 255, 0.15)",
        borderRadius: "var(--radius-xs)",
      }}
    >
      1
    </div>
  );
};

export default BankPilesArea;
