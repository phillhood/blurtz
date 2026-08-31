import React from "react";
import clsx from "clsx";
import { Game, JoinGameRequest } from "@types";
import { Button } from "@styles";
import { SeatIndicator, TableStatus } from "@components/ui";
import { formatDate } from "@utils";

interface TableRowProps {
  game: Game;
  yours?: boolean;
  onJoin: (payload: JoinGameRequest) => void;
}

const TableRow: React.FC<TableRowProps> = ({ game, yours = false, onJoin }) => {
  const full = game.currentPlayers >= game.maxPlayers;
  const finished = game.status === "finished";
  const live = yours && (game.status === "playing" || game.status === "starting");
  const canJoin = yours ? !finished : !finished && !full;

  const action = finished ? "Finished" : yours ? "Rejoin" : full ? "Full" : "Join";

  return (
    <div className={clsx("blurtz-row", yours && "blurtz-row--mine", live && "blurtz-row--live")}>
      <div className="blurtz-row__main">
        <div className="blurtz-row__name">{game.name}</div>
        <div className="blurtz-row__meta">
          <TableStatus
            status={game.status}
            currentPlayers={game.currentPlayers}
            maxPlayers={game.maxPlayers}
            yours={yours}
          />
          {yours && live && <span>{`Round ${game.currentRound}`}</span>}
          {yours && live && game.yourScore !== undefined && (
            <span>{`You ${game.yourScore}`}</span>
          )}
          {yours && live && game.leaderScore !== undefined && (
            <span>{`Leader ${game.leaderScore}`}</span>
          )}
          {!yours && <span>{`First to ${game.targetScore}`}</span>}
          {!yours && <span>{formatDate(game.createdAt)}</span>}
          {!yours && game.hostUsername && <span>{game.hostUsername}</span>}
        </div>
      </div>

      <div className="blurtz-row__right">
        <SeatIndicator
          filled={game.currentPlayers}
          total={game.maxPlayers}
          yoursSeated={yours}
        />
        <Button
          variant={yours ? "primary" : canJoin ? "secondary" : "tertiary"}
          onClick={() => onJoin({ id: game.id })}
          disabled={!canJoin}
        >
          {action}
        </Button>
      </div>
    </div>
  );
};

export default TableRow;
