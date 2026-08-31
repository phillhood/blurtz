// Display helpers only. No placement rule belongs here: `canPlace` in
// `@blurtz/shared` is the one authority, and call sites ask it directly.

export const getGameStatusTitle = (
  status: string,
  playerCount: number,
  maxPlayers: number,
  // The winner's USERNAME, resolved by the caller from `gameState.players` -
  // `gameState.winner` is a Player id, and interpolating it raw greets the
  // winner with a UUID. Nullable because a finished game need not have a
  // winner: a game everybody forfeited finishes with nobody.
  winnerName?: string | null
): string => {
  switch (status) {
    case "waiting":
      return playerCount === maxPlayers
        ? ``
        : `Waiting for players... (${playerCount}/${maxPlayers})`;
    case "playing":
      return `Game in progress!`;
    case "round_over":
      return `Round over!`;
    case "finished":
      return winnerName ? `Game finished! - Winner: ${winnerName}` : `Game finished!`;
    default:
      return "Unknown status";
  }
};

/**
 * How long ago, at lobby-row density: `just now`, `4m`, `3h`, `2d`.
 * A table older than a week reads as `7d+` rather than a date - the only
 * question a row answers is whether the table is still warm.
 */
export const formatAge = (date: string | Date, now: Date = new Date()): string => {
  const seconds = Math.max(0, (now.getTime() - new Date(date).getTime()) / 1000);

  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  const days = Math.floor(seconds / 86400);
  return days > 7 ? "7d+" : `${days}d`;
};

