import React, { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cardsMovedBy, redactDeck, redactPile } from "@blurtz/shared";
import { ClientCard, Pile, VisibleCard } from "@types";
import {
  GameBoard,
  CenterArea,
  PlayerArea,
  CardArea,
  BankPiles,
  WorkPiles,
  GameCard,
  CardNumber,
  BlurtzButton,
} from "@styles";
import {
  BankPilesArea,
  BlurtzPile,
  DrawPile,
  WorkPile,
} from "@views/game/components";
import { useCardSelection } from "@views/game/hooks/useCardSelection";
import { cardHue } from "@utils";
import type { DragData } from "@views/game/components/Card";
import type { TutorialApi } from "./useTutorial";

const isVisible = (card: ClientCard): card is VisibleCard => card.faceUp;

interface TutorialBoardProps {
  tutorial: TutorialApi;
}

/**
 * The tutorial's play surface. Composed from the game's own pile components
 * rather than `views/game/components/PlayerArea`, which reads the socket-backed
 * store and has no prop escape hatch.
 */
const TutorialBoard: React.FC<TutorialBoardProps> = ({ tutorial }) => {
  const [activeCards, setActiveCards] = useState<VisibleCard[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  const deck = redactDeck(tutorial.deck);
  const bankPiles = tutorial.bankPiles.map(redactPile) as Pile[];
  const workPiles = deck.workPiles as Pile[];

  const selection = useCardSelection(tutorial.deck);

  const required = tutorial.step.requires?.(tutorial.deck, tutorial.bankPiles) ?? null;

  // Scroll the card this step is about into view. On a short viewport the
  // pinned coach sits over the lower board, so the step's own subject would
  // otherwise be behind it.
  const requiredCardId = required?.cardId;
  useEffect(() => {
    if (!requiredCardId) {
      return;
    }
    const target = boardRef.current?.querySelector(
      `[data-card-id="${requiredCardId}"]`
    );
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [requiredCardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // The spotlight points at the one move being taught, not at everything legal.
  const legalTargetIds =
    selection.selected && required && selection.selected.card.id === required.cardId
      ? [required.toPileId]
      : [];

  const commit = (cardId: string, fromPileId: string, toPileId: string) => {
    tutorial.attemptMove(cardId, fromPileId, toPileId);
    selection.clear();
  };

  const handleCardTap = (card: ClientCard, pileId: string) => {
    const picked = selection.selected;
    if (picked && picked.fromPileId !== pileId) {
      commit(picked.card.id, picked.fromPileId, pileId);
      return;
    }
    selection.toggle(card, pileId);
  };

  const handleEmptyPileTap = (pileId: string) => {
    const picked = selection.selected;
    if (picked) {
      commit(picked.card.id, picked.fromPileId, pileId);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data?.card?.faceUp) {
      return;
    }
    const source = workPiles.find((pile) => pile.id === data.fromPileId);
    if (source) {
      const stack = cardsMovedBy("work", "work", source.cards, data.card.id);
      if (stack.length > 0) {
        setActiveCards(stack.filter(isVisible));
        return;
      }
    }
    setActiveCards([data.card]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCards([]);
    const data = event.active.data.current as DragData | undefined;
    const target = event.over?.data.current as { pileId?: string } | undefined;
    if (!data || !target?.pileId) {
      return;
    }
    commit(data.card.id, data.fromPileId, target.pileId);
  };

  const canDropOnBank = (index: number, card: ClientCard) =>
    Boolean(required) && card.id === required?.cardId &&
    bankPiles[index]?.id === required?.toPileId;

  const canDropOnWork = (index: number, card: ClientCard) =>
    Boolean(required) && card.id === required?.cardId &&
    workPiles[index]?.id === required?.toPileId;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveCards([])}
    >
      <div ref={boardRef}>
      <GameBoard>
        <CenterArea>
          <BankPiles>
            <BankPilesArea
              bankPiles={bankPiles}
              canDropOnPile={canDropOnBank}
              legalTargetIds={legalTargetIds}
              onCardTap={handleCardTap}
              onEmptyPileTap={handleEmptyPileTap}
            />
          </BankPiles>
        </CenterArea>

        <PlayerArea>
          <CardArea>
            <DrawPile
              pile={deck.drawPile as Pile}
              onPileClick={tutorial.flipDraw}
              canFlip={!tutorial.finished}
              isDraggable
              isCurrentPlayer
              onCardTap={handleCardTap}
            />
            <WorkPiles>
              <WorkPile
                workPiles={workPiles}
                canDropOnPile={canDropOnWork}
                isDraggable={!tutorial.finished}
                isCurrentPlayer
                legalTargetIds={legalTargetIds}
                selectedCardId={selection.selected?.card.id}
                onCardTap={handleCardTap}
                onEmptyPileTap={handleEmptyPileTap}
              />
            </WorkPiles>
            <BlurtzPile
              pile={deck.blurtzPile as Pile}
              onCardClick={() => undefined}
              isDraggable={!tutorial.finished}
              onCardTap={handleCardTap}
            />
          </CardArea>

          {tutorial.deck.blurtzPile.cards.length === 0 && !tutorial.finished && (
            <BlurtzButton isPulsing onClick={tutorial.callBlurtz}>
              BLURTZ!
            </BlurtzButton>
          )}
        </PlayerArea>
      </GameBoard>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCards.length > 0 ? (
          <div style={{ position: "relative" }}>
            {activeCards.map((card, index) => (
              <div
                key={card.id}
                style={{
                  position: index === 0 ? "relative" : "absolute",
                  top: index * 24,
                  left: 0,
                  zIndex: index,
                }}
              >
                <GameCard
                  hue={cardHue(card.color)}
                  cardType={card.color.type}
                  style={{ cursor: "grabbing" }}
                >
                  <CardNumber>{card.value}</CardNumber>
                </GameCard>
              </div>
            ))}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TutorialBoard;
