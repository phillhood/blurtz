import React from "react";
import { EmptyState } from "@shychedelic/voidglass-react";
import { Game, JoinGameRequest } from "@types";
import { Button } from "@styles";
import { LoadingSpinner } from "@components/ui";
import TableRow from "./TableRow";

interface TableListProps {
  activeGames: Game[];
  availableGames: Game[];
  loading: boolean;
  onJoinGame: (payload: JoinGameRequest) => void;
  onJoinGameByCode: () => void;
  onCreateGame: () => void;
  onRefreshGames: () => void;
}

const TableList: React.FC<TableListProps> = ({
  activeGames,
  availableGames,
  loading,
  onJoinGame,
  onJoinGameByCode,
  onCreateGame,
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
          description="Start one and share the code, or join by a code someone sent you."
          action={
            <div className="blurtz-tables__emptyactions">
              <Button variant="tertiary" onClick={onJoinGameByCode}>
                Join by code
              </Button>
              <Button variant="primary" onClick={onCreateGame}>
                New table
              </Button>
            </div>
          }
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
