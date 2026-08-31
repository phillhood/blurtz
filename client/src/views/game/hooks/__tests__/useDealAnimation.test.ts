import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDealAnimation } from "../useDealAnimation";

describe("useDealAnimation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not animate the first render", () => {
    // Joining a game in progress is not a deal - those cards were already out.
    const { result } = renderHook(() => useDealAnimation(3));
    expect(result.current).toBe(false);
  });

  it("animates when the round advances", () => {
    const { result, rerender } = renderHook(
      ({ round }) => useDealAnimation(round),
      { initialProps: { round: 1 } }
    );
    rerender({ round: 2 });
    expect(result.current).toBe(true);
  });

  it("stops animating on its own", () => {
    const { result, rerender } = renderHook(
      ({ round }) => useDealAnimation(round),
      { initialProps: { round: 1 } }
    );
    rerender({ round: 2 });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });
});
