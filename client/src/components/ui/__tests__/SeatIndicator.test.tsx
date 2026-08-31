import { render, screen } from "@testing-library/react";
import { SeatIndicator } from "../SeatIndicator";

describe("SeatIndicator", () => {
  it("says how full the table is in words as well as shapes", () => {
    render(<SeatIndicator filled={2} total={4} />);

    expect(screen.getByText("2 of 4 seats taken")).toBeInTheDocument();
  });

  it("draws one silhouette per seat", () => {
    const { container } = render(<SeatIndicator filled={2} total={4} />);

    expect(container.querySelectorAll(".blurtz-seat")).toHaveLength(4);
    expect(container.querySelectorAll(".blurtz-seat--on")).toHaveLength(2);
  });

  it("marks the player's own seat when they are sitting at it", () => {
    const { container } = render(<SeatIndicator filled={3} total={4} yoursSeated />);

    expect(container.querySelectorAll(".blurtz-seat--you")).toHaveLength(1);
    expect(container.querySelectorAll(".blurtz-seat--on")).toHaveLength(2);
  });
});
