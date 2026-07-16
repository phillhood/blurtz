// `canDropOnBankPile` and `canDropOnWorkPile` used to live here, as the
// client's own copy of the placement rules. They are gone. The rule is
// `canPlace` in `@blurtz/shared`, which the server decides every real move
// with; the call sites now ask it directly (see `Game.tsx` and the work-pile
// affordance in `views/game/components/PlayerArea.tsx`). Nothing below is a
// rule - these are display helpers, which is why they stayed.

export const getGameStatusTitle = (
  status: string,
  playerCount: number,
  maxPlayers: number,
  // `string | null` because that is what the server sends: `readGameState`
  // resolves `winner: winner?.id || null`, and a game can finish with no
  // winner at all (everyone forfeited). The client's hand-copied GameState
  // said `winner?: string`, which was simply untrue - now that the type comes
  // from the shared package, the compiler says so.
  winner?: string | null
): string => {
  switch (status) {
    case "waiting":
      return playerCount === maxPlayers
        ? ``
        : `Waiting for players... (${playerCount}/2)`;
    case "playing":
      return `Game in progress!`;
    case "finished":
      return `Game finished! - Winner: ${winner}`;
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

  // Add ordinal suffix to day
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
