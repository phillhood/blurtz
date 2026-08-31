import React from "react";
import { Link } from "react-router-dom";
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

/**
 * How close the player is to playing: a live table before one still waiting,
 * and a table between rounds before one that has not dealt. This ordering is
 * the page's whole argument, so it does not depend on the API's row order.
 */
const REACH: Record<string, number> = {
  playing: 0,
  starting: 0,
  round_over: 1,
  paused: 2,
  waiting: 3,
  finished: 4,
};

const byReach = (a: Game, b: Game) =>
  (REACH[a.status] ?? 5) - (REACH[b.status] ?? 5);

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
      {[...activeGames].sort(byReach).map((game) => (
        <TableRow key={game.id} game={game} yours onJoin={onJoinGame} />
      ))}

      <div className="blurtz-tables__label">{`Open · ${availableGames.length}`}</div>

      {availableGames.length === 0 ? (
        <EmptyState
          title="No open tables"
          description="Start one from the top of the page, or join by a code someone sent you."
          action={
            <Link className="blurtz-tables__learn" to="/tutorial">
              New to Nertz? Learn it in a minute
            </Link>
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
