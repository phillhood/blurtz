import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "../authStore";
import { authService } from "@services/auth.service";
import { ApiError } from "@services/api.service";

// ApiError's default message is `API Error: ${status}`, which would contain
// the digits "401"/"403" and coincidentally satisfy a substring check like
// `error.message.includes("401")`. Real server error bodies carry a message
// like "Unauthorized" (no digits), so build errors that way here too -
// otherwise a revert of the `instanceof ApiError` check wouldn't fail this test.
const makeApiError = (status: number, message: string) => {
  const err = new ApiError(status, { statusCode: status, message });
  err.message = message;
  return err;
};

vi.mock("@services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getProfile: vi.fn(),
  },
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      loading: false,
      error: null,
    });

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
      const mockUser = { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0,
      cardSkin: "solid" as const, createdAt: new Date() };
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

    // `loading` is the BOOT flag - "we do not know yet whether the persisted
    // token is a session" - and `App` unmounts the entire router while it is
    // true. Login flipping it would throw away the form mid-request, along with
    // the error it was about to show.
    it("should NOT touch the store-wide loading flag during login", async () => {
      const mockResponse = {
        user: { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0,
      cardSkin: "solid" as const, createdAt: new Date() },
        token: "mock-token",
      };
      vi.mocked(authService.login).mockImplementation(
        () =>
          new Promise((resolve) => {
            expect(useAuthStore.getState().loading).toBe(false);
            resolve(mockResponse);
          })
      );

      await useAuthStore.getState().login("testuser", "password123");

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("should NOT touch the store-wide loading flag when login fails", async () => {
      vi.mocked(authService.login).mockRejectedValue(
        new Error("Invalid credentials")
      );

      await expect(
        useAuthStore.getState().login("testuser", "wrongpassword")
      ).rejects.toThrow("Invalid credentials");

      expect(useAuthStore.getState().loading).toBe(false);
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
      const mockUser = { id: "1", username: "newuser", gamesPlayed: 0, gamesWon: 0,
      cardSkin: "solid" as const, createdAt: new Date() };
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
      useAuthStore.setState({
        user: { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0,
      cardSkin: "solid" as const, createdAt: new Date() },
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
      const mockUser = { id: "1", username: "testuser", gamesPlayed: 0, gamesWon: 0,
      cardSkin: "solid" as const, createdAt: new Date() };
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
        makeApiError(401, "Unauthorized")
      );

      await useAuthStore.getState().fetchUserProfile();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
    });

    it("should clear user on 403 error", async () => {
      localStorageMock.getItem.mockReturnValue("some-token");
      vi.mocked(authService.getProfile).mockRejectedValue(
        makeApiError(403, "Forbidden")
      );

      await useAuthStore.getState().fetchUserProfile();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
    });

    it("should NOT clear the token on a non-auth error (e.g. 500)", async () => {
      localStorageMock.getItem.mockReturnValue("still-valid-token");
      vi.mocked(authService.getProfile).mockRejectedValue(
        new Error("Server error. Please try again later.")
      );

      await useAuthStore.getState().fetchUserProfile();

      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
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
