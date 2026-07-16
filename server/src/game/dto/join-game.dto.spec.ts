import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { generateAlias, generateAliasWithNumber, MAX_ALIAS_LENGTH } from "@utils";
import { JoinGameByCodeDto } from "./join-game.dto";

function validate(alias: string) {
  return validateSync(plainToInstance(JoinGameByCodeDto, { alias }));
}

/**
 * The codes this server hands out have to be codes it will take back. The
 * generators are the authority on what an alias looks like; this DTO only
 * bounds it, and a bound tighter than the generator's reach makes the game
 * unreachable by the one route into a private game.
 *
 * Sampled rather than enumerated because the word lists are private to the
 * generator. The long tail is ~1.3% of the space, so a thousand draws puts the
 * odds of a regression slipping through at effectively zero.
 */
const SAMPLES = 1000;

describe("JoinGameByCodeDto", () => {
  it("accepts every code generateAlias mints", () => {
    const refused = Array.from({ length: SAMPLES }, generateAlias).filter(
      (alias) => validate(alias).length > 0
    );

    expect(refused).toEqual([]);
  });

  it("accepts every code the uniqueness fallback mints", () => {
    const refused = Array.from({ length: SAMPLES }, generateAliasWithNumber).filter(
      (alias) => validate(alias).length > 0
    );

    expect(refused).toEqual([]);
  });

  it("accepts a code of exactly the maximum length", () => {
    expect(validate("a".repeat(MAX_ALIAS_LENGTH))).toHaveLength(0);
  });

  it("refuses a code past the maximum length", () => {
    const errors = validate("a".repeat(MAX_ALIAS_LENGTH + 1));

    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      `Game code must be at most ${MAX_ALIAS_LENGTH} characters`
    );
  });

  it("refuses an empty code", () => {
    expect(Object.values(validate("").pop()?.constraints ?? {})).toContain(
      "Game code is required"
    );
  });
});
