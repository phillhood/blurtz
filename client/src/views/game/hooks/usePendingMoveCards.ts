import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a card may stay hidden waiting for the server to answer.
 *
 * This is insurance, not the mechanism. The move normally resolves the moment
 * new state arrives (accepted or rejected). But a dropped packet must never
 * strand a card at `opacity: 0` - an invisible card that is still really
 * sitting in the pile is unrecoverable without a reload, so after this long we
 * show it again and let the next state update sort out the truth.
 */
export const PENDING_MOVE_TIMEOUT_MS = 2000;

/**
 * Tracks the cards of an in-flight move, which the board hides so they appear
 * to travel with the cursor.
 *
 * Anything that ends the move clears them: new game state arriving (the
 * server accepted it, or rejected it and sent state back), the timeout above,
 * or unmount.
 */
export function usePendingMoveCards(gameState: unknown) {
  const [pendingMoveCardIds, setPendingMoveCardIds] = useState<Set<string>>(
    new Set()
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const markPending = useCallback(
    (cardIds: string[]) => {
      setPendingMoveCardIds(new Set(cardIds));

      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPendingMoveCardIds(new Set());
      }, PENDING_MOVE_TIMEOUT_MS);
    },
    [clearTimer]
  );

  // State arrived, so the move is resolved either way - the timeout is no
  // longer needed and the cards go back to being drawn from that state.
  useEffect(() => {
    clearTimer();
    setPendingMoveCardIds((current) => (current.size > 0 ? new Set() : current));
  }, [gameState, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { pendingMoveCardIds, markPending };
}
