import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockLeaveGame = vi.fn();
const auth = { user: { id: "user-1", username: "ada" } as { username: string } | null };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ user: auth.user, logout: mockLogout }),
  useGameContext: () => ({ leaveGame: mockLeaveGame }),
}));

const Header = (await import("../Header")).default;

const renderHeader = (path = "/dashboard") => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>
  );
  return userEvent.setup();
};

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "user-1", username: "ada" } as never;
  });

  it("shows who is signed in", () => {
    renderHeader();

    expect(screen.getByText("ada")).toBeInTheDocument();
  });

  it("leaves the game before logging out", async () => {
    // Order is the point. Logging out first tears the socket down (the auth
    // subscription in gameStore disconnects on user -> null), so the leave
    // would never reach the server and the player's seat would sit there
    // occupied until the game timed them out.
    const order: string[] = [];
    mockLeaveGame.mockImplementation(() => order.push("leave"));
    mockLogout.mockImplementation(() => order.push("logout"));
    const user = await renderHeader("/game/game-1");

    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(order).toEqual(["leave", "logout"]);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("leaves the game on the way back to the dashboard", async () => {
    const user = await renderHeader("/game/game-1");

    await user.click(screen.getByRole("button", { name: "Dashboard" }));

    // Navigating away from a game without leaving it leaves the room joined.
    expect(mockLeaveGame).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("offers a way back to the dashboard only when not already there", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Header />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole("button", { name: "Dashboard" })
    ).not.toBeInTheDocument();
    unmount();

    renderHeader("/game/game-1");
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("goes home from the wordmark", async () => {
    const user = await renderHeader("/game/game-1");

    await user.click(screen.getByRole("heading", { name: "Blurtz!" }));

    expect(mockLeaveGame).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("renders without a user rather than throwing", () => {
    // The header renders during the frame where logout has cleared the user
    // but the redirect has not happened yet.
    auth.user = null;

    renderHeader();

    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("offers the way to the profile", async () => {
    const user = await renderHeader("/dashboard");

    await user.click(screen.getByRole("button", { name: "ada — profile" }));

    expect(mockNavigate).toHaveBeenCalledWith("/profile");
  });

  it("keeps an initial to fall back to where the name will not fit", async () => {
    await renderHeader("/dashboard");

    const trigger = screen.getByRole("button", { name: "ada — profile" });

    expect(trigger.querySelector(".blurtz-appheader__initial")).toHaveTextContent("A");
  });
});
