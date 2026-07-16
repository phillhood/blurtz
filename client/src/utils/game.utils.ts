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

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "waiting":
      return "#f59e0b";
    case "playing":
      return "#10b981";
    // Amber like `waiting`, and for the same reason: both are a game paused on
    // its players rather than a game running or a game done.
    case "round_over":
      return "#f59e0b";
    case "finished":
      return "#6b7280";
    default:
      return "#6b7280";
  }
};

export const formatDate = (date: string | Date): string => {
  const dateObj = new Date(date);

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  const formatted = dateObj.toLocaleDateString("en-US", options);

  const day = dateObj.getDate();
  const ordinalSuffix = getOrdinalSuffix(day);

  return formatted.replace(/(\d+),/, `$1${ordinalSuffix},`);
};

const getOrdinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};
