import React, { useState } from "react";
import { Game, JoinGameRequest } from "@types";
import { Button, Card } from "@styles";
import { LoadingSpinner } from "@components/ui";
import { GameListItem } from ".";

interface GamesListProps {
  activeGames: Game[];
  availableGames: Game[];
  loading: boolean;
  onJoinGame: (payload: JoinGameRequest) => void;
  onJoinGameByCode: () => void;
  onCreateGame?: () => void;
  onRefreshGames?: () => void;
}

const GamesList: React.FC<GamesListProps> = ({
  activeGames,
  availableGames,
  loading,
  onJoinGame,
  onJoinGameByCode,
  onCreateGame,
  onRefreshGames,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);

  const handleRefreshClick = () => {
    if (isSpinning || !onRefreshGames) return;
    setIsSpinning(true);
    onRefreshGames();
    setTimeout(() => {
      setIsSpinning(false);
    }, 300);
  };

  return (
    <div>
      {activeGames.length >= 0 && (
        <Card style={{ marginBottom: "30px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#1f2937",
              }}
            >
              My Games
            </h2>
          </div>

          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                marginBottom: "20px",
              }}
            >
              <LoadingSpinner size="medium" />
              <p style={{ color: "#6b7280", marginTop: "16px" }}>
                Loading games...
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {activeGames.map((game) => (
                <GameListItem
                  key={game.id}
                  game={game}
                  onJoin={onJoinGame}
                  active={true}
                />
              ))}
            </div>
          )}
        </Card>
      )}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#1f2937",
            }}
          >
            Available Games
          </h2>

          <div style={{ display: "flex", gap: "12px" }}>
            <Button
              variant="secondary"
              onClick={onCreateGame}
              disabled={loading}
            >
              New Game
            </Button>
            <Button
              variant="primary"
              onClick={onJoinGameByCode}
              disabled={loading}
            >
              Join by Code
            </Button>
            <Button
              variant="tertiary"
              onClick={handleRefreshClick}
              disabled={loading}
              title="Refresh Games"
              style={{
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="refresh-icon"
                style={{
                  display: "block",
                  animation: isSpinning ? "spin 0.3s linear 1" : "none",
                }}
              >
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </Button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <LoadingSpinner size="medium" />
            <p style={{ color: "#6b7280", marginTop: "16px" }}>
              Loading games...
            </p>
          </div>
        ) : availableGames.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: "#6b7280", marginBottom: "20px" }}>
              No games available. Create a new game to get started!
            </p>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {availableGames.map((game) => (
              <GameListItem key={game.id} game={game} onJoin={onJoinGame} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default GamesList;
