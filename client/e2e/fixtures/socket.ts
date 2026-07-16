import type { Page } from "@playwright/test";

/**
 * A tap on what the server actually sends this browser.
 *
 * The redaction spec exists because the leak it guards against is invisible in
 * the UI by construction: a client can be handed every opponent's face-down
 * card and still draw a card back over it. Screenshots prove nothing. The only
 * place the truth is legible is the frame on the wire, so this reads it.
 */

export interface SocketFrame {
  event: string;
  args: unknown[];
  raw: string;
}

export interface SocketRecorder {
  frames: SocketFrame[];
  /** Resolve once a frame for `event` has been received (or has already been). */
  waitFor(event: string, timeoutMs?: number): Promise<SocketFrame>;
}

/**
 * Socket.IO over websocket sends engine.io packets: `42["event",payload]`,
 * where `4` is engine.io MESSAGE and `2` is socket.io EVENT. Anything else -
 * pings (`2`/`3`), the handshake (`0`), acks - is not an event and is skipped.
 */
function parseFrame(raw: string): SocketFrame | null {
  const match = /^42(\[.*\])$/s.exec(raw);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as unknown[];
    const [event, ...args] = parsed;
    if (typeof event !== "string") return null;
    return { event, args, raw };
  } catch {
    return null;
  }
}

/**
 * Start recording. Must be called BEFORE the navigation that opens the socket -
 * `page.on("websocket")` only sees sockets opened after it is attached.
 */
export function recordSocketFrames(page: Page): SocketRecorder {
  const frames: SocketFrame[] = [];

  page.on("websocket", (ws) => {
    ws.on("framereceived", (data) => {
      if (typeof data.payload !== "string") return;
      const frame = parseFrame(data.payload);
      if (frame) frames.push(frame);
    });
  });

  return {
    frames,
    async waitFor(event: string, timeoutMs = 15000): Promise<SocketFrame> {
      const deadline = Date.now() + timeoutMs;

      for (;;) {
        const found = frames.find((f) => f.event === event);
        if (found) return found;
        if (Date.now() > deadline) {
          throw new Error(
            `Timed out after ${timeoutMs}ms waiting for socket event "${event}". ` +
              `Saw: ${frames.map((f) => f.event).join(", ") || "(nothing)"}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Walking a payload for cards
// ---------------------------------------------------------------------------

export interface FoundCard {
  /** Where in the payload it was, for a failure message worth reading. */
  path: string;
  card: Record<string, unknown>;
}

/**
 * Every card-shaped object anywhere in `value`, found structurally rather than
 * by looking in the places cards are supposed to be.
 *
 * The difference matters: a leak that only this finds is a leak in a field
 * nobody thought to check. Anything with a `faceUp` key is a card.
 */
export function findCards(value: unknown, path = "$"): FoundCard[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findCards(item, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const here: FoundCard[] =
      "faceUp" in record ? [{ path, card: record }] : [];

    return [
      ...here,
      ...Object.entries(record).flatMap(([key, item]) =>
        findCards(item, `${path}.${key}`)
      ),
    ];
  }

  return [];
}
