import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardSelection } from "../useCardSelection";
import type { ClientCard, VisibleCard } from "@types";

/** A stable reference. An inline `{}` is a new object every render, which
 *  would fire the reset effect continuously - the app passes the store's
 *  gameState, whose identity only changes when the board does. */
const STATE = {};

const card = (id: string): VisibleCard =>
  ({ id, faceUp: true, value: 5, color: { name: "Red", type: "a" } }) as VisibleCard;

describe("useCardSelection", () => {
  it("starts with nothing selected", () => {
    const { result } = renderHook(() => useCardSelection(STATE));
    expect(result.current.selected).toBeNull();
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("selects a card", () => {
    const { result } = renderHook(() => useCardSelection(STATE));
    act(() => result.current.toggle(card("a"), "work-0"));
    expect(result.current.selected?.card.id).toBe("a");
    expect(result.current.selected?.fromPileId).toBe("work-0");
    expect(result.current.isSelected("a")).toBe(true);
  });

  it("deselects when the same card is tapped again", () => {
    const { result } = renderHook(() => useCardSelection(STATE));
    act(() => result.current.toggle(card("a"), "work-0"));
    act(() => result.current.toggle(card("a"), "work-0"));
    expect(result.current.selected).toBeNull();
  });

  it("moves the selection when a different card is tapped", () => {
    const { result } = renderHook(() => useCardSelection(STATE));
    act(() => result.current.toggle(card("a"), "work-0"));
    act(() => result.current.toggle(card("b"), "work-1"));
    expect(result.current.selected?.card.id).toBe("b");
  });

  it("refuses to select a face-down card", () => {
    const { result } = renderHook(() => useCardSelection(STATE));
    const hidden = { id: "h", faceUp: false } as ClientCard;
    act(() => result.current.toggle(hidden, "draw-0"));
    expect(result.current.selected).toBeNull();
  });

  it("clears when new game state arrives", () => {
    // The board just changed underneath the selection - the card may not even
    // be where it was. Holding it would target a stale pile.
    const { result, rerender } = renderHook(
      ({ state }) => useCardSelection(state),
      { initialProps: { state: { round: 1 } as unknown } }
    );
    act(() => result.current.toggle(card("a"), "work-0"));
    rerender({ state: { round: 2 } as unknown });
    expect(result.current.selected).toBeNull();
  });
});
