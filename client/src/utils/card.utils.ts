import { CardColor } from "@types";

export const getCardColorString = (color: CardColor): string => {
  return color.code || color.name || "#000000";
};

export const getCardDisplayColor = (color: CardColor): string => {
  const colorName = color.name?.toLowerCase();
  switch (colorName) {
    case "red":
      return "#dc2626";
    case "blue":
      return "#2563eb";
    case "green":
      return "#16a34a";
    case "yellow":
      return "#ca8a04";
    default:
      return "#000000";
  }
};
