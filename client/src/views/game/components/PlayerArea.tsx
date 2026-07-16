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
} from "@styles";
import { BlurtzPile, WorkPile, DrawPile } from ".";

interface PlayerAreaProps {
  player: Player;
  isCurrentPlayer: boolean;
  opponentCount: number;
  pendingMoveCardIds?: Set<string>;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isCurrentPlayer,
  opponentCount,
  pendingMoveCardIds,
}) => {
  const { flipDrawPile, callBlitz, gameState } = useGameContext();
  const [showBlurtzButton, setShowBlurtzButton] = useState(false);
  const [justBecameAvailable, setJustBecameAvailable] = useState(false);

  const handleCardClick = (_fromPile: string, _cardIndex?: number) => {
    if (!isCurrentPlayer) return;
  };

  // One predicate, read by both the cursor and the click. These used to be two
  // conditions: the cursor checked the status, the handler did not - so a
  // finished or round_over board showed a default cursor and still emitted a
  // flip when clicked. The server refuses it, so the cost was a wasted round
  // trip and a rejection toast rather than a wrong board.
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
        <PlayerName isOpponent={!isCurrentPlayer}>
          {player.user.username}
        </PlayerName>
        <ScoreDisplay isOpponent={!isCurrentPlayer}>
          Score: {player.bankPileCount ?? 0}
        </ScoreDisplay>
      </div>

      <CardArea isOpponent={!isCurrentPlayer} opponentCount={opponentCount}>
          <DrawPile
            pile={player.deck.drawPile}
            onPileClick={handleDrawPileClick}
            canFlip={canFlipDrawPile}
            isDraggable={isDraggable}
            playerId={player.id}
            isCurrentPlayer={isCurrentPlayer}
            pendingMoveCardIds={pendingMoveCardIds}
          />
          <WorkPile
            workPiles={player.deck.workPiles}
            canDropOnPile={canDropOnWorkPile}
            isDraggable={isDraggable}
            isCurrentPlayer={isCurrentPlayer}
            pendingMoveCardIds={pendingMoveCardIds}
          />
          <BlurtzPile
            pile={player.deck.blurtzPile}
            onCardClick={() => handleCardClick("blurtz")}
            isDraggable={isDraggable}
            pendingMoveCardIds={pendingMoveCardIds}
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
