import React, { useEffect, useState } from "react";
import { ClientCard, Player } from "@types";
import { useGameContext } from "@hooks";
import { canPlace } from "@blurtz/shared";
import {
  PlayerArea as StyledPlayerArea,
  CardArea,
  PlayerName,
  ScoreDisplay,
  BlurtzButton,
  type CardSize,
} from "@styles";
import { BlurtzPile, WorkPile, DrawPile } from ".";

interface PlayerAreaProps {
  player: Player;
  isCurrentPlayer: boolean;
  opponentCount: number;
  pendingMoveCardIds?: Set<string>;
  /**
   * Whether this player is holding a socket. Defaults to connected: a caller
   * that knows nothing about presence must not paint everyone as dropped.
   */
  isConnected?: boolean;
  legalTargetIds?: string[];
  selectedCardId?: string;
  rejectedCardIds?: Set<string>;
  onCardTap?: (card: ClientCard, pileId: string) => void;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isCurrentPlayer,
  opponentCount,
  pendingMoveCardIds,
  isConnected = true,
  legalTargetIds,
  selectedCardId,
  rejectedCardIds,
  onCardTap,
}) => {
  const { flipDrawPile, callBlitz, gameState } = useGameContext();
  const [showBlurtzButton, setShowBlurtzButton] = useState(false);
  const [justBecameAvailable, setJustBecameAvailable] = useState(false);

  const handleCardClick = (_fromPile: string, _cardIndex?: number) => {
    if (!isCurrentPlayer) return;
  };

  // One predicate, read by both the cursor and the click handler. Splitting
  // them lets a board that looks unclickable still emit a flip the server will
  // refuse.
  const canFlipDrawPile =
    isCurrentPlayer &&
    player.deck.drawPile.cards.length > 0 &&
    gameState?.status === "playing";

  const handleDrawPileClick = () => {
    if (!canFlipDrawPile) return;
    flipDrawPile();
  };

  const handleBlurtzCall = () => {
    if (isCurrentPlayer && player.deck.blurtzPile.cards.length === 0) {
      callBlitz();
    }
  };

  // Whether a work pile lights up under the cursor. The rule is `canPlace`'s -
  // the server re-decides the move regardless; this only paints.
  const canDropOnWorkPile = (pileIndex: number, draggedCard: ClientCard): boolean => {
    if (!draggedCard.faceUp) return false;

    const pile = player.deck.workPiles[pileIndex];
    if (!pile) return false;

    const topCard = pile.cards[pile.cards.length - 1];
    if (topCard && !topCard.faceUp) return false;

    return canPlace("work", topCard, draggedCard);
  };

  const isDraggable = isCurrentPlayer && gameState?.status === "playing";
  const cardSize: CardSize = isCurrentPlayer ? "play" : "token";
  const isBlurtzAvailable =
    isCurrentPlayer &&
    player.deck.blurtzPile.cards.length === 0 &&
    gameState?.status === "playing";

  useEffect(() => {
    if (isBlurtzAvailable && !showBlurtzButton) {
      setJustBecameAvailable(true);
      setShowBlurtzButton(true);

      setTimeout(() => {
        setJustBecameAvailable(false);
      }, 600);
    } else if (!isBlurtzAvailable && showBlurtzButton) {
      setShowBlurtzButton(false);
      setJustBecameAvailable(false);
    }
  }, [isBlurtzAvailable, showBlurtzButton]);

  return (
    <StyledPlayerArea
      isOpponent={!isCurrentPlayer}
      opponentCount={opponentCount}
      hasBlurtzButton={showBlurtzButton}
      isExpanding={justBecameAvailable}
    >
      {/* Player name/score row - inside player area at top */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            aria-hidden="true"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#16A34A" : "#DC2626",
              flexShrink: 0,
            }}
          />
          <PlayerName isOpponent={!isCurrentPlayer}>
            {player.user.username}
          </PlayerName>
          {!isConnected && (
            <span style={{ fontSize: "0.75rem", color: "#DC2626" }}>
              Disconnected
            </span>
          )}
        </div>
        <ScoreDisplay isOpponent={!isCurrentPlayer}>
          Score: {player.bankPileCount ?? 0}
        </ScoreDisplay>
      </div>

      <CardArea
        isOpponent={!isCurrentPlayer}
        opponentCount={opponentCount}
        // A dropped player's board is still live - the server plays no move for
        // them, and they may be back mid-round. Dimmed, never hidden.
        style={{ opacity: isConnected ? 1 : 0.5, transition: "opacity 0.3s ease" }}
      >
          <DrawPile
            pile={player.deck.drawPile}
            onPileClick={handleDrawPileClick}
            canFlip={canFlipDrawPile}
            isDraggable={isDraggable}
            playerId={player.id}
            isCurrentPlayer={isCurrentPlayer}
            pendingMoveCardIds={pendingMoveCardIds}
            size={cardSize}
            onCardTap={onCardTap}
          />
          <WorkPile
            workPiles={player.deck.workPiles}
            canDropOnPile={canDropOnWorkPile}
            isDraggable={isDraggable}
            isCurrentPlayer={isCurrentPlayer}
            pendingMoveCardIds={pendingMoveCardIds}
            size={cardSize}
            legalTargetIds={legalTargetIds}
            selectedCardId={selectedCardId}
            rejectedCardIds={rejectedCardIds}
            onCardTap={onCardTap}
          />
          <BlurtzPile
            pile={player.deck.blurtzPile}
            onCardClick={() => handleCardClick("blurtz")}
            isDraggable={isDraggable}
            pendingMoveCardIds={pendingMoveCardIds}
            size={cardSize}
            onCardTap={onCardTap}
          />
        </CardArea>
      {showBlurtzButton && (
        <BlurtzButton
          onClick={handleBlurtzCall}
          isPulsing={justBecameAvailable}
          isAnimatingIn={justBecameAvailable}
        >
          BLURTZ!
        </BlurtzButton>
      )}
    </StyledPlayerArea>
  );
};

export default PlayerArea;
