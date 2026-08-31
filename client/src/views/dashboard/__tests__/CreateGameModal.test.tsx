import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateGameModal from "../components/CreateGameModal";

/**
 * The form that decides what game gets created.
 *
 * Every assertion here is on something the player can see or something the
 * server is asked for. The settings on this form are not cosmetic: maxPlayers
 * decides how many work piles get dealt, and isPrivate decides whether the
 * game shows up in a stranger's lobby.
 */
const setup = (props: Partial<React.ComponentProps<typeof CreateGameModal>> = {}) => {
  const onCreateGame = vi.fn();
  const onClose = vi.fn();
  render(
    <CreateGameModal
      isOpen
      onClose={onClose}
      onCreateGame={onCreateGame}
      {...props}
    />
  );
  return { onCreateGame, onClose, user: userEvent.setup() };
};

describe("CreateGameModal", () => {
  it("renders nothing at all when closed", () => {
    const onCreateGame = vi.fn();
    render(
      <CreateGameModal isOpen={false} onClose={vi.fn()} onCreateGame={onCreateGame} />
    );

    expect(screen.queryByText("New table")).not.toBeInTheDocument();
  });

  it("creates a game with the name and the defaults", async () => {
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "Friday Night");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    // 2 players, public, first to 100 - what a player who touches nothing else
    // gets. The 100 must match Game.targetScore's schema default.
    expect(onCreateGame).toHaveBeenCalledWith("Friday Night", 2, false, 100);
  });

  it("trims the name before sending it", async () => {
    const { onCreateGame, user } = setup();

    await user.type(
      screen.getByPlaceholderText("Enter game name..."),
      "  Friday Night  "
    );
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(onCreateGame).toHaveBeenCalledWith("Friday Night", 2, false, 100);
  });

  it("will not create a game from whitespace", async () => {
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "   ");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));
    // Enter in the field is the other way to submit a form; a disabled submit
    // button blocks implicit submission too, but assert it rather than assume.
    await user.type(screen.getByPlaceholderText("Enter game name..."), "{Enter}");

    expect(onCreateGame).not.toHaveBeenCalled();
    // No "Game name is required" message, because none is ever shown and the
    // branch that computed one is gone. The submit is `disabled={!gameName
    // .trim()}`, so the only input that could produce that error is also the
    // input that makes the button unclickable. An empty name that somehow got
    // through is `length < 2` and reads as such - see below.
    expect(screen.queryByText("Game name is required")).not.toBeInTheDocument();
  });

  it("has no unreachable maxPlayers error to show", () => {
    // maxPlayers is state this component owns, moved only by ± buttons that
    // clamp to 2-4 and are disabled at the bounds, so a local guard in
    // handleSubmit could never fire. The server's CreateGameDto enforces the
    // same rule and says so to the player.
    setup();

    expect(screen.queryByText("Minimum 2 players required")).not.toBeInTheDocument();
    expect(screen.queryByText("Maximum 4 players allowed")).not.toBeInTheDocument();
  });

  it("disables the submit until there is a name to submit", async () => {
    const { user } = setup();

    expect(screen.getByRole("button", { name: "Create and deal" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "OK");

    expect(screen.getByRole("button", { name: "Create and deal" })).toBeEnabled();
  });

  it("refuses a one-character name and says why", async () => {
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "x");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(
      screen.getByText("Game name must be at least 2 characters")
    ).toBeInTheDocument();
    expect(onCreateGame).not.toHaveBeenCalled();
  });

  it("refuses a name over 50 characters and says why", async () => {
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "x".repeat(51));
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(
      screen.getByText("Game name must be less than 50 characters")
    ).toBeInTheDocument();
    expect(onCreateGame).not.toHaveBeenCalled();
  });

  it("accepts a name of exactly 50 characters", async () => {
    // The boundary the rule above is written against. 50 is "less than 50
    // characters" here, and off-by-one on a length check is the classic way a
    // legal name gets refused.
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "x".repeat(50));
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(onCreateGame).toHaveBeenCalledWith("x".repeat(50), 2, false, 100);
  });

  it("counts players up and down between 2 and 4", async () => {
    const { onCreateGame, user } = setup();
    await user.type(screen.getByPlaceholderText("Enter game name..."), "Big Game");

    await user.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("3 players")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("4 players")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "−" }));
    expect(screen.getByText("3 players")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(onCreateGame).toHaveBeenCalledWith("Big Game", 4, false, 100);
  });

  it("cannot be pushed past 4 players or below 2", async () => {
    // The server deals work piles off this number via WORK_PILE_MAPPING; a 5
    // or a 1 has no entry there.
    const { user } = setup();

    expect(screen.getByRole("button", { name: "−" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: "+" }));

    expect(screen.getByText("4 players")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "−" })).toBeEnabled();
  });

  describe("target score", () => {
    it("sends the preset the player picked", async () => {
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Quick One");
      await user.click(screen.getByRole("radio", { name: /Quick/ }));
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(onCreateGame).toHaveBeenCalledWith("Quick One", 2, false, 25);
    });

    it("hides the custom field until Custom is chosen", async () => {
      const { user } = setup();

      expect(screen.queryByLabelText("Custom target score")).toBeNull();

      await user.click(screen.getByRole("radio", { name: "Custom" }));

      expect(screen.getByLabelText("Custom target score")).toBeInTheDocument();
    });

    it("sends a valid custom score", async () => {
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Odd One");
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      await user.type(screen.getByLabelText("Custom target score"), "75");
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(onCreateGame).toHaveBeenCalledWith("Odd One", 2, false, 75);
    });

    it.each([
      ["0", "Target score must be between 10 and 500"],
      ["9", "Target score must be between 10 and 500"],
      ["-5", "Target score must be between 10 and 500"],
      ["501", "Target score must be between 10 and 500"],
      ["1000000000", "Target score must be between 10 and 500"],
      ["25.5", "Target score must be a whole number"],
    ])("refuses a custom score of %s and says why", async (typed, message) => {
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Bad Target");
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      await user.type(screen.getByLabelText("Custom target score"), typed);
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(screen.getByText(message)).toBeInTheDocument();
      // The DTO would refuse this too; the point is that it never gets asked.
      expect(onCreateGame).not.toHaveBeenCalled();
    });

    it("refuses an empty custom score rather than sending a default", async () => {
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Empty Target");
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(screen.getByText("Target score is required")).toBeInTheDocument();
      expect(onCreateGame).not.toHaveBeenCalled();
    });

    it.each([
      ["10", 10],
      ["500", 500],
    ])("accepts the boundary score %s", async (typed, expected) => {
      // The exact values MIN/MAX are written against - an off-by-one here
      // refuses a score the server would have taken.
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Edge");
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      await user.type(screen.getByLabelText("Custom target score"), typed);
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(onCreateGame).toHaveBeenCalledWith("Edge", 2, false, expected);
    });

    it("clears a target score error once the score is fixed and resubmitted", async () => {
      const { onCreateGame, user } = setup();

      await user.type(screen.getByPlaceholderText("Enter game name..."), "Fixable");
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      const custom = screen.getByLabelText("Custom target score");
      await user.type(custom, "5");
      await user.click(screen.getByRole("button", { name: "Create and deal" }));
      expect(
        screen.getByText("Target score must be between 10 and 500")
      ).toBeInTheDocument();

      await user.clear(custom);
      await user.type(custom, "50");
      await user.click(screen.getByRole("button", { name: "Create and deal" }));

      expect(
        screen.queryByText("Target score must be between 10 and 500")
      ).not.toBeInTheDocument();
      expect(onCreateGame).toHaveBeenCalledWith("Fixable", 2, false, 50);
    });

    it("forgets a custom score when cancelled", async () => {
      const { user } = setup();

      await user.click(screen.getByRole("radio", { name: "Custom" }));
      await user.type(screen.getByLabelText("Custom target score"), "42");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      // Back to the Standard preset, with the custom field gone rather than
      // sitting there pre-filled from a game that was never created.
      expect(screen.getByRole("radio", { name: /Standard/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      expect(screen.queryByLabelText("Custom target score")).toBeNull();
    });
  });

  it("creates a private game when asked", async () => {
    const { onCreateGame, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "Secret");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    // A private game that arrives public is an invitation to strangers.
    expect(onCreateGame).toHaveBeenCalledWith("Secret", 2, true, 100);
  });

  it("closes after a successful create", async () => {
    const { onClose, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "Friday Night");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when validation refused the submit", async () => {
    const { onClose, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "x");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    // Closing here would throw away the error it just rendered.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("forgets what was typed when cancelled", async () => {
    // The modal is not unmounted on close, so state left behind would show up
    // pre-filled the next time it opens.
    const { onClose, user } = setup();

    await user.type(screen.getByPlaceholderText("Enter game name..."), "Abandoned");
    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Enter game name...")).toHaveValue("");
    expect(screen.getByText("2 players")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("clears a validation error once the name is fixed and resubmitted", async () => {
    const { onCreateGame, user } = setup();
    const input = screen.getByPlaceholderText("Enter game name...");

    await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));
    expect(
      screen.getByText("Game name must be at least 2 characters")
    ).toBeInTheDocument();

    await user.type(input, "yz");
    await user.click(screen.getByRole("button", { name: "Create and deal" }));

    // A stale error next to a name that is now fine would be a lie.
    expect(
      screen.queryByText("Game name must be at least 2 characters")
    ).not.toBeInTheDocument();
    expect(onCreateGame).toHaveBeenCalledWith("xyz", 2, false, 100);
  });

  it("labels the game name field with its own label and nothing else", () => {
    setup();

    // "Name" and "Private table" are distinct controls. A second
    // htmlFor="gameName" would make the heading resolve to this input and
    // append itself to the input's accessible name.
    expect(screen.getByLabelText("Name")).toHaveAttribute("id", "gameName");
    expect(screen.queryByLabelText("Private table")).toBeNull();
    expect(screen.queryByLabelText("Seats")).toBeNull();
  });

  it("toggles the private switch through its own label", async () => {
    const { user } = setup();

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByText("Joinable by code only"));

    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
  it("paints every control from the token layer", () => {
    setup();

    const inline = [...document.body.querySelectorAll<HTMLElement>("[style]")]
      .map((el) => el.getAttribute("style") ?? "")
      .join(" ");

    expect(inline).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("picks a target score without opening a select", () => {
    setup();

    expect(screen.getByRole("radio", { name: /Quick/ })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
