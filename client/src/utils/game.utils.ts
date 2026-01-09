import { Card } from "@types";

export const canDropOnBankPile = (
  bankPiles: Array<{ cards: Card[] }>,
  pileIndex: number,
  draggedCard: Card
): boolean => {
  const pile = bankPiles[pileIndex];
  if (!pile || pile.cards.length === 0) {
    return draggedCard.number === 1;
  }
  const topCard = pile.cards[pile.cards.length - 1];
  // Must be same color and +1 value
  return (
    draggedCard.color.name === topCard.color.name &&
    draggedCard.number === topCard.number + 1
  );
};

export const canDropOnWorkPile = (
  workPiles: Array<{ cards: Card[] }>,
  pileIndex: number,
  draggedCard: Card
): boolean => {
  const pile = workPiles[pileIndex];
  // Empty work pile accepts any card
  if (pile.cards.length === 0) return true;

  const topCard = pile.cards[pile.cards.length - 1];
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
