import React from "react";
import { useDroppable, useDndContext } from "@dnd-kit/core";
import { WorkPiles as WorkPilesStyled, WorkPile as WorkPileStyled, PileLabel } from "@styles";
import { Card as CardType, Pile } from "@types";
import { FannedCardPile } from ".";
import { DragData } from "./Card";

interface WorkPilesComponentProps {
  workPiles: Pile[];
  canDropOnPile: (index: number, card: CardType) => boolean;
  isDraggable: boolean;
  isCurrentPlayer: boolean;
  pendingMoveCardIds?: Set<string>;
}

const WorkPilesComponent: React.FC<WorkPilesComponentProps> = ({
  workPiles,
  canDropOnPile,
  isDraggable,
  isCurrentPlayer,
  pendingMoveCardIds,
}) => {
  const { active } = useDndContext();
  const dragData = active?.data.current as DragData | undefined;

  // Guard against undefined workPiles (can happen during game state transitions)
  if (!workPiles || workPiles.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <PileLabel>Work</PileLabel>
      <WorkPilesStyled style={{ paddingTop: "8px" }}>
        {workPiles.map((pile, index) => {
          // Check if the bottom card of this pile is being dragged (making pile appear empty)
          const isDraggingFromThisPile = dragData?.fromPileId === pile.id;
          const bottomCardId = pile.cards[0]?.id;
          const isDraggingBottomCard =
            isDraggingFromThisPile && dragData?.card?.id === bottomCardId;
          const showPlaceholder =
            pile.cards.length === 0 || isDraggingBottomCard;

          return (
            <WorkPileStyled key={pile.id} style={{ position: "relative" }}>
              {/* Always render placeholder behind */}
              {isCurrentPlayer && (
                <EmptyWorkPileDropZone
                  pileId={pile.id}
                  pileIndex={index}
                  canDrop={(card) => canDropOnPile(index, card)}
                  visible={showPlaceholder}
                />
              )}
              {/* Render cards on top */}
              {pile.cards.length > 0 && (
                <div style={{ position: "absolute", top: 0, left: 0 }}>
                  <FannedCardPile
                    cards={pile.cards}
                    pileId={pile.id}
                    isDraggable={isDraggable}
                    onDrop={isCurrentPlayer ? () => {} : undefined}
                    canDrop={
                      isCurrentPlayer
                        ? (card) => canDropOnPile(index, card)
                        : undefined
                    }
                    pendingMoveCardIds={pendingMoveCardIds}
                  />
                </div>
              )}
            </WorkPileStyled>
          );
        })}
      </WorkPilesStyled>
    </div>
  );
};

const EmptyWorkPileDropZone: React.FC<{
  pileId: string;
  pileIndex: number;
  canDrop: (card: CardType) => boolean;
  visible: boolean;
}> = ({ pileId, pileIndex, canDrop, visible }) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `work-pile-empty-${pileId}`,
    data: { pileId, pileIndex, isEmpty: true },
  });

  // Check if the active card can be dropped here
  const canDropHere =
    isOver && active ? canDrop((active.data.current as DragData)?.card) : false;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: "88px",
        height: "118px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: "0.8rem",
        fontFamily: "Germania One, sans-serif",
        color: "#94a3b8",
        backgroundColor: canDropHere
          ? "rgba(16, 185, 129, 0.2)"
          : "rgba(51, 65, 85, 0.5)",
        border: canDropHere ? "2px dashed #10b981" : "2px dashed #475569",
        borderRadius: "6px",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.15s ease-out",
      }}
    />
  );
};

export default WorkPilesComponent;
