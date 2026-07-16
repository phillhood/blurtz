import { ClientCard } from "@types";

/**
 * These two answer "may this drop land here?" for the cursor. The server
 * re-decides every move regardless - this is what greys out a target, not what
 * authorises a play.
 *
 * Both begin by refusing face-down cards. That is not defensive padding: a
 * face-down card has no `value` to compare, on the wire or in the type, so
 * there is no rule to apply to one. Nothing draggable is ever face-down
 * anyway, which is why this reads as a guard rather than a branch.
 */
export const canDropOnBankPile = (
  bankPiles: Array<{ cards: ClientCard[] }>,
  pileIndex: number,
  draggedCard: ClientCard
): boolean => {
  if (!draggedCard.faceUp) return false;

  const pile = bankPiles[pileIndex];
  if (!pile || pile.cards.length === 0) {
    return draggedCard.number === 1;
  }
  const topCard = pile.cards[pile.cards.length - 1];
  if (!topCard.faceUp) return false;

  // Must be same color and +1 value
  return (
    draggedCard.color.name === topCard.color.name &&
    draggedCard.number === topCard.number + 1
  );
};

export const canDropOnWorkPile = (
  workPiles: Array<{ cards: ClientCard[] }>,
  pileIndex: number,
  draggedCard: ClientCard
): boolean => {
  if (!draggedCard.faceUp) return false;

  const pile = workPiles[pileIndex];
  // Empty work pile accepts any card
  if (pile.cards.length === 0) return true;

  const topCard = pile.cards[pile.cards.length - 1];
  if (!topCard.faceUp) return false;

  // Must be descending (-1) and opposite type (boy/girl)
  return (
    draggedCard.color.type !== topCard.color.type &&
    draggedCard.number === topCard.number - 1
  );
};

export const getGameStatusTitle = (
  status: string,
  playerCount: number,
  maxPlayers: number,
  winner?: string
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
