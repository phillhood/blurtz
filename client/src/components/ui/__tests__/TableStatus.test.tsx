import { render, screen } from "@testing-library/react";
import { TableStatus, tableStatusLabel } from "../TableStatus";

describe("tableStatusLabel", () => {
  it("distinguishes a table waiting for people from one waiting to start", () => {
    expect(tableStatusLabel("waiting", 2, 4, false)).toBe("2 seats open");
    expect(tableStatusLabel("waiting", 4, 4, false)).toBe("Full");
    expect(tableStatusLabel("waiting", 2, 4, true)).toBe("Waiting to start");
  });

  it("names the states a game in progress can be in", () => {
    expect(tableStatusLabel("playing", 4, 4, true)).toBe("Live");
    expect(tableStatusLabel("round_over", 4, 4, true)).toBe("Between rounds");
    expect(tableStatusLabel("finished", 4, 4, true)).toBe("Finished");
  });
});

describe("TableStatus", () => {
  it("renders the label it computes", () => {
    render(<TableStatus status="waiting" currentPlayers={2} maxPlayers={4} />);

    expect(screen.getByText("2 seats open")).toBeInTheDocument();
  });

  it("keys a live table of yours as actionable", () => {
    const { container } = render(
      <TableStatus status="playing" currentPlayers={4} maxPlayers={4} yours />
    );

    expect(container.querySelector(".blurtz-status--live")).toBeInTheDocument();
  });
});
