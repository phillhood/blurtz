import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  PENDING_MOVE_TIMEOUT_MS,
  usePendingMoveCards,
} from "../hooks/usePendingMoveCards";

/**
 * The board hides the cards of an in-flight move so they appear to travel with
 * the cursor. Anything that leaves them hidden forever is a card that is
 * really in the pile but invisible - unrecoverable without a reload.
 */
describe("usePendingMoveCards", () => {
  // Must be a stable reference across renders, the way the real gameState is:
  // it comes from the zustand store, whose identity only changes when the
  // server sends new state. A fresh literal per render would read as "new
  // state arrived" on every render.
  const STATE_A = { id: "game-1" };
  const STATE_B = { id: "game-1", moved: true };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the moving cards as pending", () => {
    const { result } = renderHook(() => usePendingMoveCards(STATE_A));

    act(() => result.current.markPending(["card-a", "card-b"]));

    expect(result.current.pendingMoveCardIds).toEqual(
      new Set(["card-a", "card-b"])
    );
  });

  it("clears them when new game state arrives", () => {
    const { result, rerender } = renderHook(
      ({ gameState }) => usePendingMoveCards(gameState),
      { initialProps: { gameState: STATE_A as object } }
    );

    act(() => result.current.markPending(["card-a"]));
    expect(result.current.pendingMoveCardIds.size).toBe(1);

    // The server answered - accepted, or rejected WITH state. Either way the
    // move is resolved and the board should draw from the new state.
    rerender({ gameState: STATE_B });

    expect(result.current.pendingMoveCardIds.size).toBe(0);
  });

  it("does not clear them on a re-render that brings no new state", () => {
    const { result, rerender } = renderHook(
      ({ gameState }) => usePendingMoveCards(gameState),
      { initialProps: { gameState: STATE_A as object } }
    );

    act(() => result.current.markPending(["card-a"]));
    // An unrelated re-render (a sibling's state, a hover) is not an answer
    // from the server, and must not un-hide a card still in flight.
    rerender({ gameState: STATE_A });

    expect(result.current.pendingMoveCardIds.size).toBe(1);
  });

  it("clears them after the timeout even if the server never answers", () => {
    const { result } = renderHook(() => usePendingMoveCards(STATE_A));

    act(() => result.current.markPending(["card-a"]));
    expect(result.current.pendingMoveCardIds.size).toBe(1);

    // A dropped packet must never strand a card at opacity: 0.
    act(() => vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS));

    expect(result.current.pendingMoveCardIds.size).toBe(0);
  });

  it("keeps the cards hidden until the timeout actually elapses", () => {
    const { result } = renderHook(() => usePendingMoveCards(STATE_A));

    act(() => result.current.markPending(["card-a"]));
    act(() => vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS - 1));

    // Clearing early would flash the card back at its origin mid-move.
    expect(result.current.pendingMoveCardIds.size).toBe(1);
  });

  it("does not clear a newer move when an older move's timer fires", () => {
    const { result, rerender } = renderHook(
      ({ gameState }) => usePendingMoveCards(gameState),
      { initialProps: { gameState: STATE_A as object } }
    );

    act(() => result.current.markPending(["card-a"]));

    // First move resolves...
    rerender({ gameState: STATE_B });
    // ...and a second move starts right after.
    act(() => result.current.markPending(["card-b"]));

    // The first move's timer, had it survived, would land here.
    act(() => vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS - 1));

    expect(result.current.pendingMoveCardIds).toEqual(new Set(["card-b"]));
  });

  it("cancels its timer on unmount", () => {
    const { result, unmount } = renderHook(() => usePendingMoveCards(STATE_A));

    act(() => result.current.markPending(["card-a"]));
    unmount();

    // A timer firing after unmount would set state on a dead component.
    expect(() => vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
