import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JoinGameModal from "../components/JoinGameModal";

const setup = (isOpen = true) => {
  const onJoinGame = vi.fn();
  const onClose = vi.fn();
  render(
    <JoinGameModal isOpen={isOpen} onJoinGame={onJoinGame} onClose={onClose} />
  );
  return { onJoinGame, onClose, user: userEvent.setup() };
};

describe("JoinGameModal", () => {
  it("renders nothing at all when closed", () => {
    setup(false);

    expect(screen.queryByText("Join Game by Code")).not.toBeInTheDocument();
  });

  it("joins by the code the player typed", async () => {
    const { onJoinGame, user } = setup();

    await user.type(
      screen.getByPlaceholderText("e.g., happy-blue-lemur"),
      "happy-blue-cat"
    );
    await user.click(screen.getByRole("button", { name: "Join Game" }));

    // `alias`, not `id` - that is what routes this to /api/game/joinByCode
    // rather than to joinById, which would 404 on a game code.
    expect(onJoinGame).toHaveBeenCalledWith({ alias: "happy-blue-cat" });
  });

  it("submits on Enter, not just on the button", async () => {
    const { onJoinGame, user } = setup();

    await user.type(
      screen.getByPlaceholderText("e.g., happy-blue-lemur"),
      "happy-blue-cat{Enter}"
    );

    expect(onJoinGame).toHaveBeenCalledWith({ alias: "happy-blue-cat" });
  });

  it("will not join with no code", async () => {
    const { onJoinGame, user } = setup();

    expect(screen.getByRole("button", { name: "Join Game" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g., happy-blue-lemur"), "   ");

    // Whitespace is not a game code. Sending it costs a round trip to be told
    // so, and the throttler counts it.
    expect(screen.getByRole("button", { name: "Join Game" })).toBeDisabled();
    expect(onJoinGame).not.toHaveBeenCalled();
  });

  it("enables the join once there is a code", async () => {
    const { user } = setup();

    await user.type(
      screen.getByPlaceholderText("e.g., happy-blue-lemur"),
      "happy-blue-cat"
    );

    expect(screen.getByRole("button", { name: "Join Game" })).toBeEnabled();
  });

  it("closes and forgets the code on cancel", async () => {
    const { onClose, onJoinGame, user } = setup();

    await user.type(screen.getByPlaceholderText("e.g., happy-blue-lemur"), "abandoned");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onJoinGame).not.toHaveBeenCalled();
    // The modal is not unmounted on close; a code left behind would be
    // pre-filled next time it opens.
    expect(screen.getByPlaceholderText("e.g., happy-blue-lemur")).toHaveValue("");
  });

  it("closes on the × without joining", async () => {
    const { onClose, onJoinGame, user } = setup();

    await user.click(screen.getByRole("button", { name: "×" }));

    expect(onClose).toHaveBeenCalled();
    expect(onJoinGame).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const { onClose, user } = setup();
    const dialog = screen.getByRole("heading", { name: "Join Game by Code" })
      .parentElement!.parentElement!.parentElement!;

    await user.click(dialog);

    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the panel itself is clicked", async () => {
    // The backdrop handler compares target to currentTarget. Without that
    // check, typing in the field would dismiss the modal.
    const { onClose, user } = setup();

    await user.click(screen.getByRole("heading", { name: "Join Game by Code" }));
    await user.click(screen.getByPlaceholderText("e.g., happy-blue-lemur"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
