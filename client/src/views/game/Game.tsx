import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import { useGameContext, useAuthContext } from "@hooks";
import { ClientCard, PileType, VisibleCard } from "@types";
import { isVisibleCard, isFatalErrorCode } from "@utils";
// The rules, from the one place they live. Imported by package name through
// the workspace symlink - there is no path alias for @blurtz/shared, on
// purpose.
import { canPlace, cardsMovedBy } from "@blurtz/shared";
import { GameContainer, GameBoard, CenterArea, OpponentsRow, GameCard, CardNumber } from "@styles";
import {
  GameLoadingScreen,
  GameErrorScreen,
  GameHeader,
  GameStatusDisplay,
  GameWaitingForOpponent,
  PlayerArea,
  BankPilesArea,
  ConfirmDialog,
  GameToast,
  ReconnectingBanner,
} from "./components";
import { DragData } from "./components/Card";
import { usePendingMoveCards } from "./hooks/usePendingMoveCards";
import { cardHue } from "@utils/card.utils";

const Game: React.FC = () => {
  const { user } = useAuthContext();
  const { gameId } = useParams<{ gameId: string }>();
  const joinedGameIdRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const {
    gameState,
    joinGame,
    leaveGame,
    makeMove,
    connected,
    reconnecting,
    connectedUserIds,
    error,
    clearError,
    moveRejection,
    clearMoveRejection,
    currentPlayer,
  } = useGameContext();

  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  // The cards travelling under the cursor. VisibleCard[] because the drag
  // overlay draws their faces - and because a face-down card cannot be picked
  // up in the first place.
  const [activeCards, setActiveCards] = useState<VisibleCard[]>([]);
  const { pendingMoveCardIds, markPending } = usePendingMoveCards(gameState);

  // Configure sensors for @dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    // Join whenever we're connected and haven't already joined this gameId -
    // this re-runs (and re-joins) when navigating from one game to another
    // without a remount, since gameId is a real dependency here.
    if (connected && gameId && joinedGameIdRef.current !== gameId) {
      joinedGameIdRef.current = gameId;
      joinGame(gameId);
    }
    // Reset on disconnect so we rejoin on reconnect
    if (!connected) {
      joinedGameIdRef.current = null;
    }
    // `joinGame` is declared here because it is read here. It changes identity
    // only when `user.id` does (it is a useCallback over a zustand action, both
    // stable), and a re-run cannot re-join anyway - `joinedGameIdRef` is what
    // decides that, not this array.
  }, [gameId, connected, joinGame]);

  // Fatal errors block the game; everything else is a toast. The decision is
  // the server's `code` and nothing else - the message is never inspected,
  // because plenty of transient failures say "not found" and a player who hits
  // one is still in a game they can go on playing.
  const isFatalError = isFatalErrorCode(error?.code);

  const handleLeave = () => {
    if (gameState?.status === "playing") {
      setShowForfeitDialog(true);
    } else {
      leaveGame();
      navigate("/dashboard");
    }
  };

  const handleConfirmForfeit = () => {
    leaveGame(true);
    setShowForfeitDialog(false);
    navigate("/dashboard");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(gameState?.alias || "");
  };

  // The drop affordances below find the pile, then hand the rule to
  // `canPlace` - the same function the server decides the real move with. They
  // do not decide anything themselves: the server is authoritative and
  // re-validates every move, so all this changes is whether a target lights up
  // under the cursor.
  //
  // Both start by refusing a face-down card, and that is not padding: a
  // face-down card has no value to compare, on the wire or in the type, so
  // there is no rule to apply to one. Nothing draggable is face-down anyway.
  const canDropOnBankPile = (pileIndex: number, draggedCard: ClientCard) => {
    if (!draggedCard.faceUp) return false;

    const pile = gameState?.bankPiles[pileIndex];
    const topCard = pile?.cards[pile.cards.length - 1];
    // A bank pile's top card is always face-up in a real game; if it somehow
    // is not, there is nothing to compare against and the drop is refused
    // rather than treated as an empty pile.
    if (topCard && !topCard.faceUp) return false;

    return canPlace("bank", topCard, draggedCard);
  };

  // Check if a pile ID belongs to a Bank pile
  const isBankPile = (pileId: string): boolean => {
    return gameState?.bankPiles.some(p => p.id === pileId) ?? false;
  };

  // Check if a pile ID belongs to current player's Work piles
  const isCurrentPlayerWorkPile = (pileId: string): boolean => {
    return currentPlayer?.deck.workPiles.some(p => p.id === pileId) ?? false;
  };

  // Validate Work pile drop
  const canDropOnWorkPile = (pileId: string, draggedCard: ClientCard): boolean => {
    if (!draggedCard.faceUp) return false;

    const pile = currentPlayer?.deck.workPiles.find(p => p.id === pileId);
    if (!pile) return false;

    const topCard = pile.cards[pile.cards.length - 1];
    if (topCard && !topCard.faceUp) return false;

    // An empty work pile accepts any card. `canPlace` is the only copy of that
    // rule - do not re-state it here.
    return canPlace("work", topCard, draggedCard);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as DragData;
    // `card.faceUp` narrows the drag to a VisibleCard, which is what the
    // overlay renders. It is not a new restriction - every pile already
    // refuses to make a face-down card draggable.
    if (dragData?.card?.faceUp) {
      // Dragging out of a work pile picks up the stack above the card. The
      // destination is not known yet, so this asks what a work→work move would
      // carry - the widest a move from here can reach.
      const workPile = currentPlayer?.deck.workPiles.find(p => p.id === dragData.fromPileId);
      if (workPile) {
        const stack = cardsMovedBy("work", "work", workPile.cards, dragData.card.id);
        if (stack.length > 0) {
          setActiveCards(stack.filter(isVisibleCard));
          return;
        }
      }
      // For other piles, just show the single card
      setActiveCards([dragData.card]);
    }
  };

  /**
   * The cards this move will actually carry, for the pending-move bookkeeping.
   *
   * Destination-aware: only a work→work move takes the stack above the card.
   * Delegates to the engine's `cardsMovedBy` so both sides run one function.
   */
  const getMovingCardIds = (fromPileId: string, cardId: string, toType: PileType): string[] => {
    const workPile = currentPlayer?.deck.workPiles.find(p => p.id === fromPileId);
    if (!workPile) return [cardId];

    const moving = cardsMovedBy("work", toType, workPile.cards, cardId);
    return moving.length > 0 ? moving.map(c => c.id) : [cardId];
  };

  // Handle @dnd-kit drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCards([]);
    const { active, over } = event;

    if (!over) return;

    const dragData = active.data.current as DragData;
    const dropData = over.data.current as { pileId?: string; pileIndex?: number; isEmpty?: boolean; card?: ClientCard } | undefined;
    const dropId = over.id as string;

    // Dropping back on the same pile - no-op
    if (dropData?.pileId === dragData.fromPileId) return;

    // Check if dropping on an empty pile (Bank or Work)
    if (dropData?.pileId && dropData?.isEmpty) {
      // Check if it's a Bank pile
      const bankPileIndex = gameState?.bankPiles.findIndex(p => p.id === dropData.pileId) ?? -1;
      if (bankPileIndex >= 0 && canDropOnBankPile(bankPileIndex, dragData.card)) {
        const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id, "bank");
        markPending(movingIds);
        makeMove(dragData.card.id, dragData.fromPileId, dropData.pileId);
        return;
      }
      // Check if it's a Work pile (empty work piles accept any card)
      if (isCurrentPlayerWorkPile(dropData.pileId)) {
        const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id, "work");
        markPending(movingIds);
        makeMove(dragData.card.id, dragData.fromPileId, dropData.pileId);
        return;
      }
      return;
    }

    // Dropping on a card
    if (dropId.startsWith("drop-") && dropData?.pileId) {
      const targetPileId = dropData.pileId;

      // Check if it's a Bank pile
      if (isBankPile(targetPileId)) {
        const pileIndex = gameState?.bankPiles.findIndex(p => p.id === targetPileId) ?? -1;
        if (pileIndex >= 0 && canDropOnBankPile(pileIndex, dragData.card)) {
          const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id, "bank");
          markPending(movingIds);
          makeMove(dragData.card.id, dragData.fromPileId, targetPileId);
        }
      }
      // Check if it's a Work pile (current player only)
      else if (isCurrentPlayerWorkPile(targetPileId)) {
        if (canDropOnWorkPile(targetPileId, dragData.card)) {
          const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id, "work");
          markPending(movingIds);
          makeMove(dragData.card.id, dragData.fromPileId, targetPileId);
        }
      }
    }
  };

  const goToDashboard = () => navigate("/dashboard");

  // Presence is only ever a reason to mark someone DOWN. Until the server has
  // said who is connected, everyone reads as present.
  const isPlayerConnected = (playerUserId: string) =>
    connectedUserIds === null || connectedUserIds.includes(playerUserId);

  // The full-screen wait belongs to the FIRST connect, when there is no board to
  // keep. A drop mid-game gets the banner further down instead.
  if (!connected && !reconnecting) {
    return (
      <GameLoadingScreen
        title="Connecting to game server..."
        subtitle="Please wait while we establish connection"
        onBackClick={goToDashboard}
      />
    );
  }

  if (isFatalError && error) {
    return <GameErrorScreen error={error.message} onBackClick={goToDashboard} />;
  }

  // Transient error shown as toast (rendered later in main return)

  if (!gameState) {
    const debugInfo = (
      <>
        <div style={{ fontSize: "14px", color: "#94a3b8" }}>
          Game ID: {gameId}
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          Connected: {connected ? "Yes" : "No"}
        </div>
      </>
    );

    return (
      <GameLoadingScreen
        title="Loading game..."
        onBackClick={goToDashboard}
        debugInfo={debugInfo}
      />
    );
  }

  const opponents = gameState.players.filter((p) => p.user.id !== user?.id);
  const opponentCount = opponents.length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {reconnecting && <ReconnectingBanner />}

      {/* Transient toast: a refused move, else a non-fatal error. Each branch
          passes a stable store action as onDismiss - GameToast keys its
          dismiss timer on that identity, so an inline closure would restart
          the countdown on every render and the toast would never leave. */}
      {moveRejection ? (
        <GameToast
          message={moveRejection}
          duration={3000}
          onDismiss={clearMoveRejection}
        />
      ) : error && !isFatalError ? (
        <GameToast message={error.message} duration={3000} onDismiss={clearError} />
      ) : null}

      <GameContainer>
        <GameHeader onLeave={handleLeave} onCopyCode={handleCopyCode} />

        <GameStatusDisplay />

        {gameState.status === "playing" && (
          <GameBoard>
            <OpponentsRow
              opponentCount={opponentCount}
              className="opponents-row"
            >
              {opponents.length > 0 ? (
                opponents.map((opponent) => (
                  <PlayerArea
                    key={opponent.user.id}
                    player={opponent}
                    isCurrentPlayer={false}
                    opponentCount={opponentCount}
                    isConnected={isPlayerConnected(opponent.user.id)}
                  />
                ))
              ) : (
                <GameWaitingForOpponent
                  playerCount={gameState.players.length}
                />
              )}
            </OpponentsRow>

            <CenterArea className="center-area">
              <BankPilesArea
                bankPiles={gameState.bankPiles}
                canDropOnPile={canDropOnBankPile}
              />
            </CenterArea>

            {currentPlayer && (
              <PlayerArea
                player={currentPlayer}
                isCurrentPlayer={true}
                opponentCount={0}
                pendingMoveCardIds={pendingMoveCardIds}
                // Own socket state, first-hand: a dropped client's presence set
                // is whatever the server last managed to tell it.
                isConnected={connected}
              />
            )}
          </GameBoard>
        )}
      </GameContainer>

      {showForfeitDialog && (
        <ConfirmDialog
          title="Forfeit Game"
          message="Are you sure you want to forfeit? This will end the game for you."
          onConfirm={handleConfirmForfeit}
          onCancel={() => setShowForfeitDialog(false)}
          confirmText="Forfeit"
          cancelText="Cancel"
          variant="danger"
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeCards.length > 0 ? (
          <div style={{ position: "relative" }}>
            {activeCards.map((card, index) => {
              const isTopOfDragStack = index === activeCards.length - 1;
              return (
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
                    <CardNumber
                      style={
                        isTopOfDragStack
                          ? undefined
                          : {
                              position: "absolute",
                              top: "2px",
                              left: "50%",
                              transform: "translateX(-50%)",
                            }
                      }
                    >
                      {card.value}
                    </CardNumber>
                  </GameCard>
                </div>
              );
            })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default Game;
