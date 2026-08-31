import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import { useGameContext, useAuthContext } from "@hooks";
import { ClientCard, VisibleCard } from "@types";
import { isVisibleCard, isFatalErrorCode } from "@utils";
// The rules, from the one place they live. Imported by package name through
// the workspace symlink - there is no path alias for @blurtz/shared, on
// purpose.
import { cardsMovedBy } from "@blurtz/shared";
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
import { useMoveResolver } from "./hooks/useMoveResolver";
import { useCardSelection } from "./hooks/useCardSelection";
import { useRejectedCards } from "./hooks/useRejectedCards";
import { useDealAnimation } from "./hooks/useDealAnimation";

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
  const moveResolver = useMoveResolver(
    gameState?.bankPiles,
    currentPlayer?.deck?.workPiles
  );
  const selection = useCardSelection(gameState);
  const dealing = useDealAnimation(gameState?.currentRound);
  const { rejectedIds, rememberAttempt } = useRejectedCards(moveRejection);
  const legalTargetIds = selection.selected
    ? moveResolver.legalTargetIds(
        selection.selected.card,
        selection.selected.fromPileId
      )
    : [];

  /**
   * The tap path. A tap on a legal target commits the selected card; any other
   * tap moves the selection. Both this and the drag handler go through
   * `moveResolver`, so the two inputs cannot disagree about what is legal.
   */
  const handleCardTap = (card: ClientCard, pileId: string) => {
    const picked = selection.selected;
    if (picked && legalTargetIds.includes(pileId)) {
      const resolved = moveResolver.resolve(picked.card, picked.fromPileId, pileId);
      if (resolved) {
        markPending(resolved.movingCardIds);
        rememberAttempt(resolved.movingCardIds);
        makeMove(picked.card.id, picked.fromPileId, resolved.toPileId);
      }
      selection.clear();
      return;
    }
    selection.toggle(card, pileId);
  };

  /**
   * An empty pile has no card to tap, so it carries its own handler. Without
   * it the tap path cannot reach an empty bank or work pile at all - the drag
   * path could, which made taps silently less capable than drags.
   */
  const handleEmptyPileTap = (pileId: string) => {
    const picked = selection.selected;
    if (!picked || !legalTargetIds.includes(pileId)) {
      return;
    }
    const resolved = moveResolver.resolve(picked.card, picked.fromPileId, pileId);
    if (resolved) {
      markPending(resolved.movingCardIds);
      rememberAttempt(resolved.movingCardIds);
      makeMove(picked.card.id, picked.fromPileId, resolved.toPileId);
    }
    selection.clear();
  };

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

  // The drop affordance finds the pile and hands the question to the resolver,
  // which is the same decision the real move goes through. It decides nothing
  // itself: the server re-validates every move, so all this changes is whether
  // a target lights up under the cursor.
  const canDropOnBankPile = (pileIndex: number, draggedCard: ClientCard) => {
    const pile = gameState?.bankPiles[pileIndex];
    if (!pile) return false;
    return moveResolver.resolve(draggedCard, "", pile.id) !== null;
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
      const workPile = currentPlayer?.deck?.workPiles.find(p => p.id === dragData.fromPileId);
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

  // Handle @dnd-kit drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCards([]);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current as DragData;
    const dropData = over.data.current as { pileId?: string } | undefined;
    if (!dropData?.pileId || !dragData) return;

    const resolved = moveResolver.resolve(
      dragData.card,
      dragData.fromPileId,
      dropData.pileId
    );
    if (!resolved) return;

    markPending(resolved.movingCardIds);
    rememberAttempt(resolved.movingCardIds);
    makeMove(dragData.card.id, dragData.fromPileId, resolved.toPileId);
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
          <GameBoard isPicking={!!selection.selected} isDealing={dealing}>
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
                legalTargetIds={legalTargetIds}
                onCardTap={handleCardTap}
                onEmptyPileTap={handleEmptyPileTap}
              />
            </CenterArea>

            {currentPlayer && (
              <PlayerArea
                player={currentPlayer}
                isCurrentPlayer={true}
                opponentCount={0}
                pendingMoveCardIds={pendingMoveCardIds}
                legalTargetIds={legalTargetIds}
                selectedCardId={selection.selected?.card.id}
                rejectedCardIds={rejectedIds}
                onCardTap={handleCardTap}
                onEmptyPileTap={handleEmptyPileTap}
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
