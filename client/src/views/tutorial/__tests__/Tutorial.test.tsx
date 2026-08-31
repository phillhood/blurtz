import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Tutorial from "../Tutorial";
import { TUTORIAL_STEPS } from "../script";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const auth: { user: { username: string } | null } = { user: null };
vi.mock("@hooks", () => ({ useAuthContext: () => auth }));

const renderTutorial = () =>
  render(
    <MemoryRouter>
      <Tutorial />
    </MemoryRouter>
  );

describe("Tutorial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = null;
  });

  it("opens on the first lesson with the board already dealt", () => {
    const { container } = renderTutorial();

    expect(screen.getByText(TUTORIAL_STEPS[0].title)).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${TUTORIAL_STEPS.length}`)).toBeInTheDocument();
    expect(container.querySelector(".blurtz-board")).toBeInTheDocument();
  });

  it("works signed out, and sends a stranger to sign in rather than the lobby", async () => {
    renderTutorial();

    await userEvent.click(screen.getByRole("button", { name: /Back to sign in/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("sends a signed-in player back to the tables", async () => {
    auth.user = { username: "designpass" };
    renderTutorial();

    await userEvent.click(screen.getByRole("button", { name: /Back to tables/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("lets a player leave at any point", async () => {
    renderTutorial();

    await userEvent.click(screen.getByRole("button", { name: /Skip the tutorial/ }));

    expect(mockNavigate).toHaveBeenCalled();
  });

  it("advances past the opening lesson when the player says they have it", async () => {
    renderTutorial();

    await userEvent.click(screen.getByRole("button", { name: "Got it" }));

    await waitFor(() =>
      expect(screen.getByText(TUTORIAL_STEPS[1].title)).toBeInTheDocument()
    );
  });

  it("finishes the whole script through Show me, and offers a real game after", async () => {
    renderTutorial();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));

    for (let step = 1; step < TUTORIAL_STEPS.length; step++) {
      await userEvent.click(screen.getByRole("button", { name: "Show me" }));
    }
    await userEvent.click(screen.getByRole("button", { name: /BLURTZ/i }));

    await waitFor(() =>
      expect(screen.getByText(/That is the whole game/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Sign in and play/ })).toBeInTheDocument();
  });
});
