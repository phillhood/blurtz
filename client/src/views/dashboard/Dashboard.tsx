import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext, useGameContext } from "@hooks";
import { useGames } from "@hooks";
import { useJoinGameById, useJoinGameByCode } from "@hooks/queries/useGamesQuery";
import { PageContainer } from "@styles";
import { LoadingScreen } from "@components/ui";
import { UserWelcomeCard, GamesList, CreateGameModal } from "./components";
import JoinGameModal from "./components/JoinGameModal";
import { JoinGameRequest } from "@types";

const Dashboard: React.FC = () => {
  const { user } = useAuthContext();
  const { createAndJoinGame } = useGameContext();
  const { activeGames, availableGames, loading, refetch } = useGames();
  const navigate = useNavigate();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // TanStack Query mutations for joining games
  const joinByIdMutation = useJoinGameById();
  const joinByCodeMutation = useJoinGameByCode();

  const handleCreateGame = async (
    gameName: string,
    maxPlayers: number,
    isPrivate: boolean
  ) => {
    const game = await createAndJoinGame(gameName, maxPlayers, isPrivate);
    if (game?.id) {
      setTimeout(() => {
        navigate(`/game/${game.id}`);
      }, 50);
    }
  };

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleOpenJoinModal = () => {
    setIsJoinModalOpen(true);
  };

  const handleCloseJoinModal = () => {
    setIsJoinModalOpen(false);
  };

  const handleJoinGame = async (payload: JoinGameRequest) => {
    try {
      let game;
      if (payload.id) {
        game = await joinByIdMutation.mutateAsync(payload.id);
      } else if (payload.alias) {
        game = await joinByCodeMutation.mutateAsync(payload.alias);
      }
      if (game?.id) {
        navigate(`/game/${game.id}`);
      }
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

  const handleRefreshGames = () => {
    refetch();
  };

  if (loading && availableGames.length === 0 && activeGames.length === 0) {
    return <LoadingScreen title="Loading dashboard..." />;
  }

  return (
    <PageContainer>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        {user && (
          <div style={{ marginBottom: "2rem" }}>
            <UserWelcomeCard user={user} />
          </div>
        )}

        <GamesList
          activeGames={activeGames}
          availableGames={availableGames}
          loading={loading}
          onJoinGame={handleJoinGame}
          onJoinGameByCode={handleOpenJoinModal}
          onCreateGame={handleOpenCreateModal}
          onRefreshGames={handleRefreshGames}
        />

        <CreateGameModal
          isOpen={isCreateModalOpen}
          onClose={handleCloseCreateModal}
          onCreateGame={handleCreateGame}
        />

        <JoinGameModal
          isOpen={isJoinModalOpen}
          onClose={handleCloseJoinModal}
          onJoinGame={handleJoinGame}
        />
      </div>
    </PageContainer>
  );
};

export default Dashboard;
