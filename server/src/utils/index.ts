// The game's constants (CARD_COLORS, GAME_CONSTANTS, SOCKET_EVENTS, ...) are
// NOT here any more - they live in `@blurtz/shared` alongside the rules that
// use them. SOCKET_EVENTS in particular was one of two hand-synced copies;
// there is one now. Import them from `@blurtz/shared`.
//
// What is left is what only the server needs.
export { generateAlias, generateAliasWithNumber } from "./alias";
export { getErrorMessage } from "./error-handler";
export { validateWsPayload, WsValidationError } from "./ws-validation";
