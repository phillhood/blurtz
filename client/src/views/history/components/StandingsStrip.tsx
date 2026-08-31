import React from "react";
import clsx from "clsx";

interface StandingsStripProps {
  players: { username: string; finalScore: number }[];
  me: string;
}

/** Final standings, highest first. The viewer's own block is keyed purple. */
const StandingsStrip: React.FC<StandingsStripProps> = ({ players, me }) => {
  return (
    <span className="blurtz-standings">
      {players.map((player, index) => (
        <span
          key={player.username}
          className={clsx(
            "blurtz-seatscore",
            player.username === me && "blurtz-seatscore--me",
            index === 0 && "blurtz-seatscore--first"
          )}
        >
          <span className="blurtz-seatscore__who">{player.username}</span>
          <span className="blurtz-seatscore__value">{player.finalScore}</span>
        </span>
      ))}
    </span>
  );
};

export default StandingsStrip;
