import React from "react";
import clsx from "clsx";
import type { GameStatus } from "@blurtz/shared";

interface TableStatusProps {
  status: GameStatus;
  currentPlayers: number;
  maxPlayers: number;
  yours?: boolean;
}

/**
 * The one sentence a row says about a table. `yours` changes what a waiting table means:
 * a seat you already hold is waiting to start, not waiting for you to take it.
 */
export const tableStatusLabel = (
  status: GameStatus,
  currentPlayers: number,
  maxPlayers: number,
  yours: boolean
): string => {
  if (status === "finished") {
    return "Finished";
  }
  if (status === "round_over") {
    return "Between rounds";
  }
  if (status === "playing" || status === "starting") {
    return "Live";
  }
  if (status === "paused") {
    return "Paused";
  }
  if (yours) {
    return "Waiting to start";
  }
  const open = maxPlayers - currentPlayers;
  if (open <= 0) {
    return "Full";
  }
  return open === 1 ? "1 seat open" : `${open} seats open`;
};

export const TableStatus: React.FC<TableStatusProps> = ({
  status,
  currentPlayers,
  maxPlayers,
  yours = false,
}) => {
  const live = yours && (status === "playing" || status === "starting");
  const spent = status === "finished" || (!yours && currentPlayers >= maxPlayers);

  return (
    <span
      className={clsx(
        "blurtz-status",
        live && "blurtz-status--live",
        spent && "blurtz-status--spent"
      )}
    >
      <span className="blurtz-status__pip" />
      {tableStatusLabel(status, currentPlayers, maxPlayers, yours)}
    </span>
  );
};
