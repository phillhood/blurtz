import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import { useGameContext, useAuthContext } from "@hooks";
import { Card } from "@types";
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
} from "./components";
import { DragData } from "./components/Card";

const Game: React.FC = () => {
  const { user } = useAuthContext();
  const { gameId } = useParams<{ gameId: string }>();
  const gameIdRef = useRef<string | null>(gameId);
  const hasJoinedRef = useRef<boolean>(false);
  const navigate = useNavigate();

  const {
    gameState,
    joinGame,
    leaveGame,
    makeMove,
    connected,
    error,
    clearError,
    currentPlayer,
  } = useGameContext();

  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [activeCards, setActiveCards] = useState<Card[]>([]);
  const [pendingMoveCardIds, setPendingMoveCardIds] = useState<Set<string>>(new Set());

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
    if (connected && gameIdRef.current && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      joinGame(gameIdRef.current);
    }
    // Reset on disconnect so we rejoin on reconnect
    if (!connected) {
      hasJoinedRef.current = false;
    }
  }, [gameIdRef, connected]);

  // Check if error is fatal (should block the game) or transient (show toast)
  const isFatalError = error?.includes("not found") || error?.includes("does not exist");

  useEffect(() => {
    if (isFatalError) {
      navigate("/dashboard");
    }
  }, [isFatalError, navigate]);

  // Clear pending move cards when game state updates
  useEffect(() => {
    if (pendingMoveCardIds.size > 0) {
      setPendingMoveCardIds(new Set());
    }
  }, [gameState]);

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

  const canDropOnBankPile = (pileIndex: number, draggedCard: Card) => {
    const pile = gameState?.bankPiles[pileIndex];
    if (!pile || pile.cards.length === 0) {
      return draggedCard.number === 1;
    }
    const topCard = pile.cards[pile.cards.length - 1];
    // Must be same color (compare by name) and +1 value
    return (
      draggedCard.color.name === topCard.color.name &&
      draggedCard.number === topCard.number + 1
    );
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
  const canDropOnWorkPile = (pileId: string, draggedCard: Card, _fromPileId: string): boolean => {
    const pile = currentPlayer?.deck.workPiles.find(p => p.id === pileId);
    if (!pile) return false;

    // Empty work pile accepts any card
    if (pile.cards.length === 0) return true;

    const topCard = pile.cards[pile.cards.length - 1];
    // Must be descending (-1) and opposite type (boy/girl)
    return (
      draggedCard.color.type !== topCard.color.type &&
      draggedCard.number === topCard.number - 1
    );
  };

  // Handle @dnd-kit drag start event
  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as DragData;
    if (dragData?.card) {
      // Check if dragging from a work pile - if so, get the whole stack
      const workPile = currentPlayer?.deck.workPiles.find(p => p.id === dragData.fromPileId);
      if (workPile) {
        const cardIndex = workPile.cards.findIndex(c => c.id === dragData.card.id);
        if (cardIndex >= 0) {
          setActiveCards(workPile.cards.slice(cardIndex));
          return;
        }
      }
      // For other piles, just show the single card
      setActiveCards([dragData.card]);
    }
  };

  // Get all card IDs being moved (for stack moves from work piles)
  const getMovingCardIds = (fromPileId: string, cardId: string): string[] => {
    const workPile = currentPlayer?.deck.workPiles.find(p => p.id === fromPileId);
    if (workPile) {
      const cardIndex = workPile.cards.findIndex(c => c.id === cardId);
      if (cardIndex >= 0) {
        return workPile.cards.slice(cardIndex).map(c => c.id);
      }
    }
    return [cardId];
  };

  // Handle @dnd-kit drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCards([]);
    const { active, over } = event;

    if (!over) return;

    const dragData = active.data.current as DragData;
    const dropData = over.data.current as { pileId?: string; pileIndex?: number; isEmpty?: boolean; card?: Card } | undefined;
    const dropId = over.id as string;

    // Dropping back on the same pile - no-op
    if (dropData?.pileId === dragData.fromPileId) return;

    // Check if dropping on an empty pile (Bank or Work)
    if (dropData?.pileId && dropData?.isEmpty) {
      // Check if it's a Bank pile
      const bankPileIndex = gameState?.bankPiles.findIndex(p => p.id === dropData.pileId) ?? -1;
      if (bankPileIndex >= 0 && canDropOnBankPile(bankPileIndex, dragData.card)) {
        const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id);
        setPendingMoveCardIds(new Set(movingIds));
        makeMove(dragData.card.id, dragData.fromPileId, dropData.pileId);
        return;
      }
      // Check if it's a Work pile (empty work piles accept any card)
      if (isCurrentPlayerWorkPile(dropData.pileId)) {
        const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id);
        setPendingMoveCardIds(new Set(movingIds));
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
          const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id);
          setPendingMoveCardIds(new Set(movingIds));
          makeMove(dragData.card.id, dragData.fromPileId, targetPileId);
        }
      }
      // Check if it's a Work pile (current player only)
      else if (isCurrentPlayerWorkPile(targetPileId)) {
        if (canDropOnWorkPile(targetPileId, dragData.card, dragData.fromPileId)) {
          const movingIds = getMovingCardIds(dragData.fromPileId, dragData.card.id);
          setPendingMoveCardIds(new Set(movingIds));
          makeMove(dragData.card.id, dragData.fromPileId, targetPileId);
        }
      }
    }
  };

  const goToDashboard = () => navigate("/dashboard");

  if (!connected) {
    return (
      <GameLoadingScreen
        title="Connecting to game server..."
        subtitle="Please wait while we establish connection"
        onBackClick={goToDashboard}
      />
    );
  }

  if (isFatalError && error) {
    return <GameErrorScreen error={error} onBackClick={goToDashboard} />;
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
      {/* Transient error toast */}
      {error && !isFatalError && (
        <GameToast message={error} duration={3000} onDismiss={clearError} />
      )}

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
                    color={card.color.code || card.color.name || "#000000"}
                    pattern={{ background: "#1a1a1a" }}
                    isDragging={false}
                    canDrop={false}
                    borderStyle={card.color.type === "a" ? "solid" : "dashed"}
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
                      {card.number}
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
