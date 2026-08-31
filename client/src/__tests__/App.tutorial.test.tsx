import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The tutorial's whole claim is that it needs no account and no server. That
 * claim is only true if it also survives boot: a stale token makes `App` fetch
 * a profile before it knows who the visitor is, and a stalled backend leaves
 * that request pending forever.
 */

vi.mock("@services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getProfile: vi.fn(),
  },
}));

const { authService } = await import("@services/auth.service");
const { useAuthStore } = await import("@stores/authStore");
const App = (await import("../App")).default;

describe("App - the tutorial while the profile request hangs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/tutorial");
    localStorage.setItem("token", "a-stale-token");
    useAuthStore.setState({ user: null, loading: true });
  });

  it("plays the tutorial while the server never answers", async () => {
    vi.mocked(authService.getProfile).mockImplementation(
      () => new Promise(() => {})
    );

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "How to play" })).toBeInTheDocument()
    );
    expect(screen.getByText("Step 1 of 8")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("still makes every other route wait for the answer", async () => {
    vi.mocked(authService.getProfile).mockImplementation(
      () => new Promise(() => {})
    );
    window.history.replaceState({}, "", "/dashboard");

    render(<App />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
