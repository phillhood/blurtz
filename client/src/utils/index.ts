export * from "./card.utils";
export * from "./game.utils";
export * from "./style.utils";

// `socket.utils.ts` used to be re-exported here. It is gone: its lone export,
// `createSocketConfig`, had no importers anywhere, and it described a socket
// this app does not open - reconnectionDelay 1000 against the real 2000,
// timeout 5000 against 10000, and no reconnectionDelayMax or autoConnect at
// all. The config the client actually connects with is built in
// `services/socket.service.ts`, which is the only place that should own it.

// `constants.utils.ts` used to be re-exported here. It is gone: its
// SOCKET_EVENTS was one of two hand-synced copies (now `@blurtz/shared`), its
// API_ENDPOINTS described routes the server has never served, its
// GAME_CONSTANTS claimed 3 work piles and 4 bank piles where the server has a
// per-player-count map and 16, and its PILE_RULES thought an empty work pile
// only accepted a 10 - which is not this game's rule and never was. What was
// worth keeping lives in `@blurtz/shared`; import it from there.
