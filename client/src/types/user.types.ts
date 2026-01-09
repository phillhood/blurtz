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

export interface User {
  id: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: Date;
}
