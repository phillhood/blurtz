export * from "./card.utils";
export * from "./game.utils";
export * from "./socket.utils";
export * from "./style.utils";

// `constants.utils.ts` used to be re-exported here. It is gone: its
// SOCKET_EVENTS was one of two hand-synced copies (now `@blurtz/shared`), its
// API_ENDPOINTS described routes the server has never served, its
// GAME_CONSTANTS claimed 3 work piles and 4 bank piles where the server has a
// per-player-count map and 16, and its PILE_RULES thought an empty work pile
// only accepted a 10 - which is not this game's rule and never was. What was
// worth keeping lives in `@blurtz/shared`; import it from there.
