import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUserStats } from "../useUserStats";
import { User } from "@types";

const user = (over: Partial<User> = {}): User =>
  ({ id: "user-1", username: "ada", gamesPlayed: 0, gamesWon: 0, ...over }) as User;

describe("useUserStats", () => {
  it("works the win rate out as a whole percentage", () => {
    const { result } = renderHook(() =>
      useUserStats(user({ gamesPlayed: 4, gamesWon: 1 }))
    );

    expect(result.current).toEqual({ gamesPlayed: 4, gamesWon: 1, winRate: 25 });
  });

  it("rounds the win rate rather than rendering 33.33333333333333%", () => {
    const { result } = renderHook(() =>
      useUserStats(user({ gamesPlayed: 3, gamesWon: 1 }))
    );

    expect(result.current.winRate).toBe(33);
  });

  it("does not divide by zero for a user who has never played", () => {
    // The reason the guard is there: 0/0 is NaN, and "Win Rate: NaN%" is what
    // every brand-new account would greet its owner with.
    const { result } = renderHook(() => useUserStats(user()));

    expect(result.current.winRate).toBe(0);
    expect(Number.isNaN(result.current.winRate)).toBe(false);
  });

  it("reports zeroes rather than throwing when there is no user", () => {
    // The dashboard renders this during the frame before the profile lands.
    const { result } = renderHook(() => useUserStats(null));

    expect(result.current).toEqual({ gamesPlayed: 0, gamesWon: 0, winRate: 0 });
  });

  it("treats missing counters as zero", () => {
    // An older row, or a profile response that omitted them.
    const { result } = renderHook(() =>
      useUserStats({ id: "user-1", username: "ada" } as User)
    );

    expect(result.current).toEqual({ gamesPlayed: 0, gamesWon: 0, winRate: 0 });
  });

  it("reports a perfect record as 100", () => {
    const { result } = renderHook(() =>
      useUserStats(user({ gamesPlayed: 7, gamesWon: 7 }))
    );

    expect(result.current.winRate).toBe(100);
  });

  it("keeps the same object while the user is unchanged", () => {
    // It is memoised on `user`, and Profile destructures it every render.
    // A new object per render would defeat any memo downstream.
    const same = user({ gamesPlayed: 4, gamesWon: 1 });
    const { result, rerender } = renderHook(() => useUserStats(same));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
