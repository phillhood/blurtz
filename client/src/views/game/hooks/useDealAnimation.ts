import { useEffect, useRef, useState } from "react";

export const DEAL_ANIMATION_MS = 400;

/**
 * True for a moment after a new round is dealt.
 *
 * Keyed on the round number rather than on the cards, so joining a game that is
 * already in progress does not replay a deal that happened without you.
 */
export function useDealAnimation(currentRound: number | undefined): boolean {
  const [dealing, setDealing] = useState(false);
  const previousRound = useRef(currentRound);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousRound.current === currentRound) return;
    previousRound.current = currentRound;
    if (currentRound === undefined) return;

    setDealing(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDealing(false);
    }, DEAL_ANIMATION_MS);
  }, [currentRound]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return dealing;
}
