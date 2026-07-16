// The game's constants (CARD_COLORS, GAME_CONSTANTS, SOCKET_EVENTS, ...) live in
// `@blurtz/shared` alongside the rules that use them - import them from there,
// not from here. What is left is what only the server needs.
export { generateAlias, generateAliasWithNumber, MAX_ALIAS_LENGTH } from "./alias";
export { getErrorMessage } from "./error-handler";
export { validateWsPayload, WsValidationError } from "./ws-validation";
