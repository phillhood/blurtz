import React from "react";

/**
 * The socket is down and being retried. A banner rather than a loading screen:
 * the board is still meaningful while the connection is not, and blanking it
 * costs the player their place in a game that is still running without them.
 */
const ReconnectingBanner: React.FC = () => (
  <div
    role="status"
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1001,
      padding: "8px 16px",
      backgroundColor: "rgba(217, 119, 6, 0.95)",
      color: "white",
      fontFamily: "var(--font-body)",
      fontSize: "0.95rem",
      textAlign: "center",
    }}
  >
    Reconnecting to game server...
  </div>
);

export default ReconnectingBanner;
