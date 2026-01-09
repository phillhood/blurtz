import { User } from ".";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface CreateGameRequest {
  name: string;
  maxPlayers: number;
  isPrivate: boolean;
}

export interface JoinGameRequest {
  id?: string;
  alias?: string;
}

export interface JoinWithId extends JoinGameRequest {
  id: string;
}

export interface JoinWithAlias extends JoinGameRequest {
  alias: string;
}
