/** Which of the two card treatments a player has chosen. A display preference,
 *  never game state: it is per-viewer and never reaches another player's board. */
export type CardSkin = "solid" | "emissive";

export interface User {
  id: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
  cardSkin: CardSkin;
  createdAt: Date;
}
