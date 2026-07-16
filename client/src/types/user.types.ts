// `User` is shared: it is embedded in every `Player` the server publishes, so
// the two sides have to agree on it. It was a hand-copy of the server's until
// now.
export type { User } from "@blurtz/shared";

// Client-only: `winRate` is computed for display and never crosses the wire.
export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
}

export interface UserProfile {
  id: string;
  username: string;
  stats: UserStats;
}
