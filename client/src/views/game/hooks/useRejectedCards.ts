import { useEffect, useRef, useState } from "react";

/** How long a refused card flashes before it resolves to wherever it really is. */
export const REJECT_FLASH_MS = 500;

/**
 * The cards to shake when the server refuses a move.
 *
 * `moveRejection` is only a reason string - it names no card - so the flash is
 * driven from the ids this client last dispatched, which it already knows. The
 * flash is cosmetic and self-clearing: the board still resolves from whatever
 * state the rejection carried, exactly as before.
 */
export function useRejectedCards(moveRejection: string | null) {
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const lastAttemptRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rememberAttempt = (cardIds: string[]) => {
    lastAttemptRef.current = cardIds;
  };

  useEffect(() => {
    if (!moveRejection || lastAttemptRef.current.length === 0) return;

    setRejectedIds(new Set(lastAttemptRef.current));
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setRejectedIds(new Set());
    }, REJECT_FLASH_MS);
  }, [moveRejection]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return { rejectedIds, rememberAttempt };
}
