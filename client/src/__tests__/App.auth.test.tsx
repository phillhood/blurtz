import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * A refused login has to say so, from inside the real <App>.
 *
 * The real `App`, router, store and `Login` all run here; only the network is
 * faked. That is the point: each part is correct in isolation, and what can
 * break is the composition - `App` unmounting the router (and the `<Login>`
 * holding the error) while a store-wide `loading` is true. A test that rendered
 * `<Login>` on its own could not see it.
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

describe("App - a rejected login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/login");
    // The state `fetchUserProfile` leaves behind at boot when there is no
    // token: nothing is in flight, so the router is mounted.
    useAuthStore.setState({ user: null, loading: false, error: null });
  });

  it("shows the error and keeps what the user typed", async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new Error("Invalid credentials")
    );
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByPlaceholderText("Username"), "someone");
    await user.type(screen.getByPlaceholderText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    // The credentials survived. They did not before: the inputs were a new
    // component's, so they came back blank and the user had to retype both.
    expect(screen.getByPlaceholderText("Username")).toHaveValue("someone");
    expect(screen.getByPlaceholderText("Password")).toHaveValue(
      "wrong-password"
    );
    // Refused means refused - still on the login form, no session.
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("does not unmount the router while the request is in flight", async () => {
    let settle: (reason: unknown) => void = () => {};
    vi.mocked(authService.login).mockImplementation(
      () => new Promise((_resolve, reject) => (settle = reject))
    );
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByPlaceholderText("Username"), "someone");
    await user.type(screen.getByPlaceholderText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    // Mid-flight: the form is still mounted, the button says so, and the
    // tree-replacing "Loading..." is nowhere.
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    settle(new Error("Invalid credentials"));
    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });
});
