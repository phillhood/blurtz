import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext, useGameContext } from "@hooks";
import { useGames } from "@hooks";
import { useJoinGameById, useJoinGameByCode } from "@hooks/queries/useGamesQuery";
import { PageContainer, Button } from "@styles";
import { LoadingScreen } from "@components/ui";
import { TableList, CreateGameModal } from "./components";
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
    isPrivate: boolean,
    targetScore: number
  ) => {
    const game = await createAndJoinGame(
      gameName,
      maxPlayers,
      isPrivate,
      targetScore
    );
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

  const waiting = activeGames.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <PageContainer>
      <div className="blurtz-pagebar">
        <div>
          <h1 className="blurtz-pagetitle">{`Good ${greeting}, ${user?.username ?? ""}`}</h1>
          <p className="blurtz-pagesub">
            {waiting === 1
              ? "1 table waiting on you"
              : `${waiting} tables waiting on you`}
          </p>
        </div>
        <div className="blurtz-pagebar__actions">
          <Button variant="tertiary" onClick={handleOpenJoinModal} disabled={loading}>
            Join by code
          </Button>
          <Button variant="primary" onClick={handleOpenCreateModal} disabled={loading}>
            New table
          </Button>
        </div>
      </div>

      <TableList
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
    </PageContainer>
  );
};

export default Dashboard;
