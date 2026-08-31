import { apiClient, ApiError } from "./api.service";
import { CardSkin, User } from "@types";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export class AuthService {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>(
        "/api/auth/login",
        credentials
      );

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          throw new Error("Invalid credentials");
        } else if (error.status === 400) {
          throw new Error(error.message || "Invalid request");
        } else if (error.status >= 500) {
          throw new Error("Server error. Please try again later.");
        }
        throw new Error(error.message || "Login failed");
      }
      throw error;
    }
  }

  async register(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>(
        "/api/auth/register",
        credentials
      );

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          throw new Error("User already exists");
        } else if (error.status === 400) {
          throw new Error(error.message || "Invalid request");
        } else if (error.status >= 500) {
          throw new Error("Server error. Please try again later.");
        }
        throw new Error(error.message || "Registration failed");
      }
      throw error;
    }
  }

  async updatePreferences(cardSkin: CardSkin): Promise<User> {
    return apiClient.patch<User>("/api/auth/preferences", { cardSkin });
  }

  async getProfile(): Promise<User> {
    try {
      const response = await apiClient.get<User>("/api/auth/profile");

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          // Propagate the ApiError as-is so authStore can detect the 401
          // and clear the stale token instead of getting a flattened string.
          throw error;
        } else if (error.status === 404) {
          throw new Error("User not found");
        } else if (error.status >= 500) {
          throw new Error("Server error. Please try again later.");
        }
        throw new Error(error.message || "Failed to fetch profile");
      }
      throw error;
    }
  }
}

export const authService = new AuthService();
