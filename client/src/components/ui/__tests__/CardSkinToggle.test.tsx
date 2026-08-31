import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardSkinToggle } from "../CardSkinToggle";
import { useAuthStore } from "@stores/authStore";

const user = (cardSkin?: string) =>
  ({
    id: "u1",
    username: "phill",
    gamesPlayed: 0,
    gamesWon: 0,
    ...(cardSkin ? { cardSkin } : {}),
    createdAt: new Date().toISOString(),
  }) as never;

describe("CardSkinToggle", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: user("solid") });
  });

  it("shows which skin is active", () => {
    render(<CardSkinToggle />);
    expect(
      screen.getByRole("radio", { name: "Solid" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("asks the store for the other skin when picked", async () => {
    const setCardSkin = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ setCardSkin } as never);

    render(<CardSkinToggle />);
    await userEvent.click(screen.getByRole("radio", { name: "Emissive" }));

    expect(setCardSkin).toHaveBeenCalledWith("emissive");
  });

  it("falls back to solid when the user has no stored preference", () => {
    // An old row, or a profile fetch that has not landed yet. The board must
    // never render unskinned.
    useAuthStore.setState({ user: user() });
    render(<CardSkinToggle />);
    expect(
      screen.getByRole("radio", { name: "Solid" }).getAttribute("aria-checked")
    ).toBe("true");
  });
});
