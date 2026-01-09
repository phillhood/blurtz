import { apiClient } from "./api.service";
import { User } from "@types";

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
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error("Invalid credentials");
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || "Invalid request");
      } else if (error.response?.status >= 500) {
        throw new Error("Server error. Please try again later.");
      }
      throw new Error(error.response?.data?.message || "Login failed");
    }
  }

  async register(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>(
        "/api/auth/register",
        credentials
      );

      return response;
    } catch (error: any) {
      if (error.response?.status === 409) {
        throw new Error("User already exists");
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || "Invalid request");
      } else if (error.response?.status >= 500) {
        throw new Error("Server error. Please try again later.");
      }
      throw new Error(error.response?.data?.message || "Registration failed");
    }
  }

  async getProfile(): Promise<User> {
    try {
      const response = await apiClient.get<User>("/api/auth/profile");

      return response;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error("401");
      } else if (error.response?.status === 404) {
        throw new Error("User not found");
      } else if (error.response?.status >= 500) {
        throw new Error("Server error. Please try again later.");
      }
      throw new Error(
        error.response?.data?.message || "Failed to fetch profile"
      );
    }
  }
}

export const authService = new AuthService();
