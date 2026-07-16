import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateGameDto } from "./create-game.dto";

/**
 * The DTO is the authority on what a game may be created with - the client is
 * not trusted, so every rule it enforces is pinned here against the payload as
 * it arrives off the wire.
 */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateGameDto, payload);
  return validateSync(dto);
}

function messagesFor(payload: Record<string, unknown>, property: string) {
  return validate(payload)
    .filter((error) => error.property === property)
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

const validPayload = { name: "Friday Night", maxPlayers: 2, isPrivate: false };

describe("CreateGameDto", () => {
  describe("targetScore", () => {
    it("accepts a payload that omits it", () => {
      expect(validate(validPayload)).toHaveLength(0);
    });

    it.each([10, 25, 100, 150, 500])("accepts %s", (targetScore) => {
      expect(validate({ ...validPayload, targetScore })).toHaveLength(0);
    });

    it.each([9, 0, -1, -100])("rejects %s as below the minimum", (targetScore) => {
      expect(messagesFor({ ...validPayload, targetScore }, "targetScore")).toContain(
        "Target score must be at least 10"
      );
    });

    it.each([501, 1_000_000_000])("rejects %s as above the maximum", (targetScore) => {
      expect(messagesFor({ ...validPayload, targetScore }, "targetScore")).toContain(
        "Target score must be at most 500"
      );
    });

    it.each([25.5, "abc", "100", true, {}, []])(
      "rejects %s as not a whole number",
      (targetScore) => {
        expect(
          messagesFor({ ...validPayload, targetScore }, "targetScore")
        ).toContain("Target score must be a whole number");
      }
    );

    it("rejects null rather than letting it reach a non-nullable column", () => {
      // Omitting the field asks for the default; null is not the same request,
      // and Prisma would refuse it with a 500 rather than a 400.
      expect(messagesFor({ ...validPayload, targetScore: null }, "targetScore")).toContain(
        "Target score must be a whole number"
      );
    });
  });
});
