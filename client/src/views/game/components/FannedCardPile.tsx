import React, { useState, useRef, useCallback, useMemo } from "react";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card as CardType } from "@types";
import { GameCard, CardNumber } from "@styles";
import { DragData } from "./Card";

const CARD_HEIGHT = 118;
const DEFAULT_STACK_OFFSET = Math.floor(CARD_HEIGHT * 0.1); // 10% visible (90% overlap)
const EXPANDED_OFFSET = Math.floor(CARD_HEIGHT * 0.3); // 30% visible (70% overlap)

interface FannedCardPileProps {
  cards: CardType[];
  pileId: string;
  isDraggable?: boolean;
  onDrop?: (card: CardType) => void;
  canDrop?: (card: CardType) => boolean;
  stackOffset?: number;
  pendingMoveCardIds?: Set<string>;
}

const FannedCardPile: React.FC<FannedCardPileProps> = ({
  cards,
  pileId,
  isDraggable = false,
  onDrop,
  canDrop,
  stackOffset = DEFAULT_STACK_OFFSET,
  pendingMoveCardIds,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1); // Sticky - controls expansion
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { active } = useDndContext();

  // Find which cards should be hidden (being dragged as a stack)
  const dragData = active?.data.current as DragData | undefined;
  const isDraggingFromThisPile = dragData?.fromPileId === pileId;
  const draggedCardIndex = isDraggingFromThisPile
    ? cards.findIndex((c) => c.id === dragData?.card?.id)
    : -1;

  // Calculate the offset for each card based on hovered card
  // Only cards below (higher index than) the hovered card expand
  const getCardOffset = useCallback(
    (index: number): number => {
      if (hoveredIndex < 0 || cards.length <= 1) return stackOffset;

      // Expand cards at and below the hovered card (index >= hoveredIndex)
      if (index >= hoveredIndex) {
        return EXPANDED_OFFSET;
      }
      return stackOffset;
    },
    [hoveredIndex, cards.length, stackOffset]
  );

  // Calculate cumulative top position for each card
  const cardPositions = useMemo(() => {
    const positions: number[] = [0];
    for (let i = 1; i < cards.length; i++) {
      // Position is based on the offset of the card ABOVE (i-1)
      positions.push(positions[i - 1] + getCardOffset(i - 1));
    }
    return positions;
  }, [cards.length, getCardOffset]);

  const totalHeight = useMemo(() => {
    if (cards.length === 0) return 0;
    return cardPositions[cards.length - 1] + CARD_HEIGHT;
  }, [cards.length, cardPositions]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (cards.length <= 1) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;

      // Find if mouse is in the top 25% of any card (hot zone for expansion)
      let hotZoneIndex = -1;
      for (let i = cards.length - 1; i >= 0; i--) {
        const cardTop = cardPositions[i];
        const hotZoneBottom = cardTop + CARD_HEIGHT * 0.25; // Top 25% of card
        if (mouseY >= cardTop && mouseY <= hotZoneBottom) {
          hotZoneIndex = i;
          break;
        }
      }

      // If in a hot zone, only update if it would expand MORE cards (lower index)
      // This makes expansion "sticky" - cards stay expanded until mouse leaves
      if (hotZoneIndex >= 0 && (hoveredIndex < 0 || hotZoneIndex < hoveredIndex)) {
        if (collapseTimeoutRef.current) {
          clearTimeout(collapseTimeoutRef.current);
          collapseTimeoutRef.current = null;
        }
        setHoveredIndex(hotZoneIndex);
      }
      // Mouse is still in the stack - cancel any collapse timer
      else if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    },
    [cards.length, cardPositions, hoveredIndex]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      // Check if mouse is actually outside all card bounds (both X and Y)
      // (needed because container height animates and may lag behind expanded cards)
      const container = containerRef.current;
      if (container && hoveredIndex >= 0) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY - rect.top;

        // Check if mouse is still within any expanded card's bounds
        const lastCardTop = cardPositions[cards.length - 1];
        const lastCardBottom = lastCardTop + CARD_HEIGHT;
        const cardWidth = 88; // Card width

        const withinX = mouseX >= rect.left && mouseX <= rect.left + cardWidth;
        const withinY = mouseY >= 0 && mouseY <= lastCardBottom;

        if (withinX && withinY) {
          // Mouse is still within card bounds, don't collapse
          return;
        }
      }

      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
      collapseTimeoutRef.current = setTimeout(() => {
        setHoveredIndex(-1);
        collapseTimeoutRef.current = null;
      }, 100);
    },
    [hoveredIndex, cards.length, cardPositions]
  );

  if (cards.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: totalHeight,
        transition: "height 0.15s ease-out",
        alignSelf: "flex-start",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {cards.map((card, index) => {
        // Visual top card: either the actual top, or the card just below dragged cards
        const visualTopIndex =
          draggedCardIndex >= 0 ? draggedCardIndex - 1 : cards.length - 1;
        const isVisualTopCard = index === visualTopIndex;

        return (
          <FannedCard
            key={card.id}
            card={card}
            pileId={pileId}
            index={index}
            topPosition={cardPositions[index]}
            isDraggable={isDraggable && card.faceUp}
            isTopCard={index === cards.length - 1}
            isVisualTopCard={isVisualTopCard}
            onDrop={onDrop}
            canDrop={canDrop}
            isHiddenInDrag={draggedCardIndex >= 0 && index >= draggedCardIndex}
            isPendingMove={pendingMoveCardIds?.has(card.id) ?? false}
          />
        );
      })}
    </div>
  );
};

interface FannedCardProps {
  card: CardType;
  pileId: string;
  index: number;
  topPosition: number;
  isDraggable: boolean;
  isTopCard: boolean;
  isVisualTopCard: boolean;
  onDrop?: (card: CardType) => void;
  canDrop?: (card: CardType) => boolean;
  isHiddenInDrag: boolean;
  isPendingMove: boolean;
}

const FannedCard: React.FC<FannedCardProps> = ({
  card,
  pileId,
  index,
  topPosition,
  isDraggable,
  isTopCard,
  isVisualTopCard,
  onDrop,
  canDrop,
  isHiddenInDrag,
  isPendingMove,
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
    disabled: !isDraggable,
  });

  const {
    setNodeRef: setDropRef,
    isOver,
    active,
  } = useDroppable({
    id: dropId,
    data: { pileId, card },
    disabled: !onDrop || !isTopCard, // Only top card accepts drops
  });

  const canDropHere =
    isOver && active && canDrop && isTopCard
      ? canDrop((active.data.current as DragData)?.card)
      : false;

  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el);
    if (onDrop && isTopCard) {
      setDropRef(el);
    }
  };

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isHiddenInDrag || isPendingMove ? 0 : 1,
    cursor: isDraggable ? "grab" : "default",
    touchAction: "none",
  };

  // Shift number up when not the visual top card (number should be visible in exposed area)
  // Visual top card = centered number, other cards = number at top
  const shouldShiftNumber = !isVisualTopCard;

  const getCardColorString = (color: CardType["color"]): string => {
    return color.code || color.name || "#000000";
  };

  return (
    <div
      ref={setRefs}
      style={{
        position: index === 0 ? "relative" : "absolute",
        top: topPosition,
        left: 0,
        zIndex: index,
        transition: "top 0.15s ease-out",
        ...dragStyle,
      }}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
    >
      <GameCard
        color={getCardColorString(card.color)}
        pattern={{ background: "#1a1a1a" }}
        isDragging={isDragging}
        canDrop={canDropHere}
        borderStyle={card.color.type === "a" ? "solid" : "dashed"}
        disableHoverEffect={!isTopCard}
      >
        <CardNumber
          style={{
            position: "absolute",
            top: shouldShiftNumber ? "2px" : "50%",
            left: "50%",
            transform: `translateX(-50%) translateY(${shouldShiftNumber ? "0" : "-50%"})`,
            // Only animate non-top cards (they animate when becoming visual top during drag)
            transition: isTopCard
              ? undefined
              : "top 0.15s ease-out, transform 0.15s ease-out",
          }}
        >
          {card.number}
        </CardNumber>
      </GameCard>
    </div>
  );
};

export default FannedCardPile;
