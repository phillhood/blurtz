import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "../authStore";
import { authService } from "@services/auth.service";

// Mock the auth service
vi.mock("@services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getProfile: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("authStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      loading: false,
      error: null,
    });

    // Clear all mocks
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("login", () => {
    it("should login successfully and set user", async () => {
      const mockUser = { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0, createdAt: new Date() };
      const mockResponse = { user: mockUser, token: "mock-token" };

      vi.mocked(authService.login).mockResolvedValue(mockResponse);

      await useAuthStore.getState().login("testuser", "password123");

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "token",
        "mock-token"
      );
    });

    it("should set loading state during login", async () => {
      const mockResponse = {
        user: { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0, createdAt: new Date() },
        token: "mock-token",
      };
      vi.mocked(authService.login).mockImplementation(
        () =>
          new Promise((resolve) => {
            // Check loading state during the request
            const state = useAuthStore.getState();
            expect(state.loading).toBe(true);
            resolve(mockResponse);
          })
      );

      await useAuthStore.getState().login("testuser", "password123");
    });

    it("should handle login error", async () => {
      vi.mocked(authService.login).mockRejectedValue(
        new Error("Invalid credentials")
      );

      await expect(
        useAuthStore.getState().login("testuser", "wrongpassword")
      ).rejects.toThrow("Invalid credentials");

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Invalid credentials");
    });
  });

  describe("register", () => {
    it("should register successfully and set user", async () => {
      const mockUser = { id: "1", username: "newuser", gamesPlayed: 0, gamesWon: 0, createdAt: new Date() };
      const mockResponse = { user: mockUser, token: "mock-token" };

      vi.mocked(authService.register).mockResolvedValue(mockResponse);

      await useAuthStore.getState().register("newuser", "password123");

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "token",
        "mock-token"
      );
    });

    it("should handle registration error", async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error("Username already exists")
      );

      await expect(
        useAuthStore.getState().register("existinguser", "password123")
      ).rejects.toThrow("Username already exists");

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.error).toBe("Username already exists");
    });
  });

  describe("logout", () => {
    it("should clear user and remove token", () => {
      // Set up initial logged in state
      useAuthStore.setState({
        user: { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0, createdAt: new Date() },
        loading: false,
        error: null,
      });

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
    });
  });

  describe("fetchUserProfile", () => {
    it("should fetch profile when token exists", async () => {
      const mockUser = { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0, createdAt: new Date() };
      localStorageMock.getItem.mockReturnValue("mock-token");
      vi.mocked(authService.getProfile).mockResolvedValue(mockUser);

      await useAuthStore.getState().fetchUserProfile();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
    });

    it("should not fetch profile when no token", async () => {
      localStorageMock.getItem.mockReturnValue(null);

      await useAuthStore.getState().fetchUserProfile();

      expect(authService.getProfile).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("should clear user on 401 error", async () => {
      localStorageMock.getItem.mockReturnValue("expired-token");
      vi.mocked(authService.getProfile).mockRejectedValue(
        new Error("401 Unauthorized")
      );

      await useAuthStore.getState().fetchUserProfile();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
    });
  });

  describe("clearError", () => {
    it("should clear error state", () => {
      useAuthStore.setState({ error: "Some error" });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("setLoading", () => {
    it("should set loading state", () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().loading).toBe(true);

      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });
});
