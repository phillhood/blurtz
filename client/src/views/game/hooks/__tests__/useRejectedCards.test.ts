import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRejectedCards, REJECT_FLASH_MS } from "../useRejectedCards";

describe("useRejectedCards", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flashes the cards this client last sent when a rejection arrives", () => {
    const { result, rerender } = renderHook(
      ({ reason }) => useRejectedCards(reason),
      { initialProps: { reason: null as string | null } }
    );

    act(() => result.current.rememberAttempt(["card-1", "card-2"]));
    rerender({ reason: "That pile will not take it" });

    expect([...result.current.rejectedIds]).toEqual(["card-1", "card-2"]);
  });

  it("clears the flash on its own", () => {
    const { result, rerender } = renderHook(
      ({ reason }) => useRejectedCards(reason),
      { initialProps: { reason: null as string | null } }
    );

    act(() => result.current.rememberAttempt(["card-1"]));
    rerender({ reason: "no" });
    act(() => vi.advanceTimersByTime(REJECT_FLASH_MS + 1));

    expect(result.current.rejectedIds.size).toBe(0);
  });

  it("flashes nothing when this client sent nothing", () => {
    // A rejection can arrive for someone else's race, or after a reload.
    const { result, rerender } = renderHook(
      ({ reason }) => useRejectedCards(reason),
      { initialProps: { reason: null as string | null } }
    );
    rerender({ reason: "no" });
    expect(result.current.rejectedIds.size).toBe(0);
  });
});
