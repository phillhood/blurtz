import React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CardColor, ClientCard } from "@types";
import { GameCard, CardNumber } from "@styles";

interface CardComponentProps {
  card: ClientCard;
  pileId: string;
  onClick?: () => void;
  onDrop?: (draggedCard: ClientCard) => void;
  canDrop?: (draggedCard: ClientCard) => boolean;
  isDraggable?: boolean;
  isPendingMove?: boolean;
}

export interface DragData {
  type: "card";
  card: ClientCard;
  fromPileId: string;
}

const CardComponent: React.FC<CardComponentProps> = ({
  card,
  pileId,
  onClick,
  onDrop,
  canDrop,
  isDraggable: canBeDragged = true,
  isPendingMove = false,
}) => {
  const dragId = `card-${card.id}`;
  const dropId = `drop-${pileId}-${card.id}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: dragId,
    data: { type: "card", card, fromPileId: pileId } as DragData,
    disabled: !canBeDragged,
  });

  const {
    setNodeRef: setDropRef,
    isOver,
    active,
  } = useDroppable({
    id: dropId,
    data: { pileId, card },
    disabled: !onDrop,
  });

  // Check if the active card can be dropped here
  const canDropHere =
    isOver && active && canDrop
      ? canDrop((active.data.current as DragData)?.card)
      : false;

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const getCardColorString = (color: CardColor): string => {
    return color.code || color.name || "#000000";
  };

  const getCardPattern = (): {
    background: string;
    backgroundSize?: string;
    backgroundPosition?: string;
  } => {
    return {
      background: "#1a1a1a", // Dark base for both
    };
  };

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging || isPendingMove ? 0 : 1,
    cursor: canBeDragged ? "grab" : "default",
    touchAction: "none",
  };

  // Combined ref for both drag and drop
  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el);
    if (onDrop) {
      setDropRef(el);
    }
  };

  // Render face-down card (back of card).
  //
  // This early return is also the type narrowing: below it `card` is a
  // VisibleCard, which is the only reason `card.color` and `card.value` are
  // readable at all. A face-down card genuinely has neither - the server does
  // not send them.
  if (!card.faceUp) {
    return (
      <div
        ref={setRefs}
        style={dragStyle}
        {...(canBeDragged ? { ...listeners, ...attributes } : {})}
      >
        <GameCard
          color="#1e3a5f"
          pattern={{
            background: `repeating-linear-gradient(
              45deg,
              #1e3a5f,
              #1e3a5f 10px,
              #2d4a6f 10px,
              #2d4a6f 20px
            )`,
          }}
          isDragging={isDragging}
          canDrop={false}
          onClick={handleClick}
        >
          <div
            style={{
              width: "60px",
              height: "80px",
              border: "2px solid #4a6a8f",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Germania One, sans-serif",
              fontSize: "14px",
              color: "#8aa3bf",
            }}
          >
            NB
          </div>
        </GameCard>
      </div>
    );
  }

  // Render face-up card
  return (
    <div
      ref={setRefs}
      style={dragStyle}
      {...(canBeDragged ? { ...listeners, ...attributes } : {})}
    >
      <GameCard
        color={getCardColorString(card.color)}
        pattern={getCardPattern()}
        isDragging={isDragging}
        canDrop={canDropHere}
        onClick={handleClick}
        borderStyle={card.color.type === "a" ? "solid" : "dashed"}
      >
        <CardNumber>{card.value}</CardNumber>
      </GameCard>
    </div>
  );
};

export default CardComponent;
