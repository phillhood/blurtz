import React from "react";
import { EmptyState } from "@shychedelic/voidglass-react";
import { Game, JoinGameRequest } from "@types";
import { LoadingSpinner } from "@components/ui";
import TableRow from "./TableRow";

interface TableListProps {
  activeGames: Game[];
  availableGames: Game[];
  loading: boolean;
  onJoinGame: (payload: JoinGameRequest) => void;
  onRefreshGames: () => void;
}

const TableList: React.FC<TableListProps> = ({
  activeGames,
  availableGames,
  loading,
  onJoinGame,
  onRefreshGames,
}) => {
  if (loading) {
    return (
      <div className="blurtz-tables__loading">
        <LoadingSpinner size="medium" />
      </div>
    );
  }

  return (
    <div className="blurtz-tables">
      {activeGames.map((game) => (
        <TableRow key={game.id} game={game} yours onJoin={onJoinGame} />
      ))}

      <div className="blurtz-tables__label">{`Open · ${availableGames.length}`}</div>

      {availableGames.length === 0 ? (
        <EmptyState
          title="No open tables"
          description="Start one from the top of the page, or join by a code someone sent you."
        />
      ) : (
        availableGames.map((game) => (
          <TableRow key={game.id} game={game} onJoin={onJoinGame} />
        ))
      )}

      <button
        type="button"
        className="blurtz-tables__refresh"
        onClick={onRefreshGames}
      >
        Refresh
      </button>
    </div>
  );
};

export default TableList;
