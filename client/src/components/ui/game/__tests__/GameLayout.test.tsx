import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameBoard, OpponentsRow, BankPiles } from "../GameLayout";

describe("GameBoard", () => {
  it("gives the bank a track that can hold a full row", () => {
    render(
      <GameBoard>
        <OpponentsRow opponentCount={3} />
        <BankPiles />
      </GameBoard>
    );
    expect(screen.getByTestId("game-board")).toHaveClass("blurtz-board");
  });

  it("does not let the opponent row absorb the board's vertical slack", () => {
    render(<OpponentsRow opponentCount={3} />);
    const row = screen.getByTestId("opponents-row");
    expect(row.className).not.toMatch(/min-h-0/);
    expect(row.className).not.toMatch(/overflow-x-auto/);
  });
});
