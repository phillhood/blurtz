import React, { useEffect, useState } from "react";
import { Player } from "@types";
import { useGameContext } from "@hooks";
import { canDropOnWorkPile } from "@utils";
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

  const handleDrawPileClick = () => {
    if (!isCurrentPlayer || player.deck.drawPile.cards.length === 0) return;
    flipDrawPile();
  };

  const handleBlurtzCall = () => {
    if (isCurrentPlayer && player.deck.blurtzPile.cards.length === 0) {
      callBlitz();
    }
  };

  const canFlipDrawPile = () => {
    return (
      isCurrentPlayer &&
      player.deck.drawPile.cards.length > 0 &&
      gameState?.status === "playing"
    );
  };

  const isDraggable = isCurrentPlayer && gameState?.status === "playing";
  let isBlurtzAvailable =
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
            canFlip={canFlipDrawPile()}
            isDraggable={isDraggable}
            playerId={player.id}
            isCurrentPlayer={isCurrentPlayer}
            pendingMoveCardIds={pendingMoveCardIds}
          />
          <WorkPile
            workPiles={player.deck.workPiles}
            canDropOnPile={(index, card) =>
              canDropOnWorkPile(player.deck.workPiles, index, card)
            }
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
