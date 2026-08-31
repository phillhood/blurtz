import React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ClientCard } from "@types";
import { GameCard, CardNumber, type CardSize } from "@styles";
import { cardHue } from "@utils/card.utils";

interface CardComponentProps {
  card: ClientCard;
  pileId: string;
  onClick?: () => void;
  onDrop?: (draggedCard: ClientCard) => void;
  canDrop?: (draggedCard: ClientCard) => boolean;
  isDraggable?: boolean;
  isPendingMove?: boolean;
  size?: CardSize;
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
  size = "play",
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
  // This early return IS the type narrowing: below it `card` is a VisibleCard,
  // which is the only reason `card.color` and `card.value` are readable at all.
  // A face-down card genuinely has neither - the server does not send them.
  if (!card.faceUp) {
    return (
      <div
        ref={setRefs}
        style={dragStyle}
        {...(canBeDragged ? { ...listeners, ...attributes } : {})}
      >
        <GameCard
          hue="var(--color-card-unknown)"
          cardType="a"
          size={size}
          faceDown
          isDragging={isDragging}
          onClick={handleClick}
        />
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
        hue={cardHue(card.color)}
        cardType={card.color.type}
        size={size}
        isDragging={isDragging}
        canDrop={canDropHere}
        onClick={handleClick}
      >
        <CardNumber>{card.value}</CardNumber>
      </GameCard>
    </div>
  );
};

export default CardComponent;
