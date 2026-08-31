import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "../Profile";

vi.mock("@hooks", () => ({
  useAuthContext: () => ({
    user: { id: "u1", username: "designpass", gamesPlayed: 47, gamesWon: 19, cardSkin: "solid" },
  }),
  useUserStats: () => ({ gamesPlayed: 47, gamesWon: 19, winRate: 40 }),
}));

describe("Profile", () => {
  it("shows the player their record", () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);

    expect(screen.getByText("designpass")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("owns the card skin picker", () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);

    expect(screen.getByRole("radio", { name: "Emissive" })).toBeInTheDocument();
  });
});
