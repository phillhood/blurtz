import React from "react";
import clsx from "clsx";
import { MatchHistoryItem } from "@types";
import { formatAge } from "@utils";
import StandingsStrip from "./StandingsStrip";

interface HistoryRowProps {
  item: MatchHistoryItem;
  me: string;
  onOpen: (gameId: string) => void;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

const placing = (item: MatchHistoryItem, me: string): string => {
  if (item.won) {
    return "Won";
  }
  const index = item.players.findIndex((player) => player.username === me);
  if (index < 0) {
    return "Finished";
  }
  return `${ORDINALS[index] ?? `${index + 1}th`} of ${item.players.length}`;
};

/** One finished game, as a whole-row button that opens its results. */
const HistoryRow: React.FC<HistoryRowProps> = ({ item, me, onOpen }) => {
  return (
    <button
      type="button"
      className="blurtz-historyrow"
      onClick={() => onOpen(item.gameId)}
    >
      <span className="blurtz-historyrow__main">
        <span className="blurtz-historyrow__name">{item.name}</span>
        <span className="blurtz-historyrow__meta">
          <span
            className={clsx(
              "blurtz-historyrow__outcome",
              item.won && "blurtz-historyrow__outcome--won"
            )}
          >
            {placing(item, me)}
          </span>
          <span>{formatAge(item.playedAt)}</span>
          <span>{`${item.rounds} rounds`}</span>
          <span>{`First to ${item.targetScore}`}</span>
        </span>
      </span>
      <StandingsStrip players={item.players} me={me} />
    </button>
  );
};

export default HistoryRow;
