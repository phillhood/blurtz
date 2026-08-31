import { Test } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";

describe("AuthService.updatePreferences", () => {
  let service: AuthService;
  let prisma: { user: { update: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { update: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it("writes the chosen skin and returns the profile shape", async () => {
    prisma.user.update.mockResolvedValue({
      id: "u1",
      username: "phill",
      gamesPlayed: 0,
      gamesWon: 0,
      cardSkin: "emissive",
      createdAt: new Date(),
    });

    const result = await service.updatePreferences("u1", {
      cardSkin: "emissive",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { cardSkin: "emissive" },
      select: expect.objectContaining({ cardSkin: true }),
    });
    expect(result.cardSkin).toBe("emissive");
  });

  it("never selects the password hash", async () => {
    prisma.user.update.mockResolvedValue({
      id: "u1",
      username: "phill",
      gamesPlayed: 0,
      gamesWon: 0,
      cardSkin: "solid",
      createdAt: new Date(),
    });

    await service.updatePreferences("u1", { cardSkin: "solid" });

    const select = prisma.user.update.mock.calls[0][0].select;
    expect(select.password).toBeUndefined();
  });
});
