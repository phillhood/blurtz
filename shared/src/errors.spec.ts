import { SOCKET_ERROR_CODES, isSocketErrorCode } from "./errors";

describe("isSocketErrorCode", () => {
  it("accepts every declared code", () => {
    const codes = Object.values(SOCKET_ERROR_CODES);

    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(isSocketErrorCode(code)).toBe(true);
    }
  });

  it("rejects a near-miss of a declared code", () => {
    expect(isSocketErrorCode("GAME_NOTFOUND")).toBe(false);
    expect(isSocketErrorCode("game_not_found")).toBe(false);
  });

  // Nest's default error body puts the HTTP status text where a code would go.
  it("rejects an HTTP status text", () => {
    expect(isSocketErrorCode("Not Found")).toBe(false);
    expect(isSocketErrorCode("Forbidden")).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(isSocketErrorCode(undefined)).toBe(false);
    expect(isSocketErrorCode(null)).toBe(false);
    expect(isSocketErrorCode({ code: SOCKET_ERROR_CODES.GAME_NOT_FOUND })).toBe(false);
  });
});
