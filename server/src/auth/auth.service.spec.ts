import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "@prisma";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

// Mock bcrypt
jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("AuthService", () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: "user-id-1",
    username: "testuser",
    password: "hashedPassword",
    gamesPlayed: 0,
    gamesWon: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue("mock-jwt-token"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);
      prismaService.user.create = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashedPassword");

      const result = await service.register({
        username: "testuser",
        password: "password123",
      });

      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("token");
      expect(result.user).not.toHaveProperty("password");
      expect(result.token).toBe("mock-jwt-token");
      expect(prismaService.user.create).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);
    });

    it("should throw ConflictException if username exists", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);

      await expect(
        service.register({ username: "testuser", password: "password123" })
      ).rejects.toThrow(ConflictException);
    });

    it("should hash the password before saving", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);
      prismaService.user.create = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashedPassword");

      await service.register({
        username: "testuser",
        password: "password123",
      });

      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          username: "testuser",
          password: "hashedPassword",
        },
      });
    });

    it("should generate JWT token with correct payload", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);
      prismaService.user.create = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashedPassword");

      await service.register({
        username: "testuser",
        password: "password123",
      });

      expect(jwtService.sign).toHaveBeenCalledWith({
        username: mockUser.username,
        sub: mockUser.id,
      });
    });
  });

  describe("login", () => {
    it("should login successfully with valid credentials", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        username: "testuser",
        password: "password123",
      });

      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("token");
      expect(result.user).not.toHaveProperty("password");
      expect(result.token).toBe("mock-jwt-token");
    });

    it("should throw UnauthorizedException for invalid password", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: "testuser", password: "wrongpassword" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for non-existent user", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        service.login({ username: "nonexistent", password: "password123" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should generate JWT token on successful login", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ username: "testuser", password: "password123" });

      expect(jwtService.sign).toHaveBeenCalledWith({
        username: mockUser.username,
        sub: mockUser.id,
      });
    });
  });

  describe("validateUser", () => {
    it("should return user without password for valid credentials", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser("testuser", "password123");

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty("password");
      expect(result.username).toBe("testuser");
    });

    it("should return null for invalid password", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser("testuser", "wrongpassword");

      expect(result).toBeNull();
    });

    it("should return null for non-existent user", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      const result = await service.validateUser("nonexistent", "password123");

      expect(result).toBeNull();
    });
  });

  describe("findById", () => {
    it("should return user by id", async () => {
      const userWithoutPassword = {
        id: mockUser.id,
        username: mockUser.username,
        gamesPlayed: mockUser.gamesPlayed,
        gamesWon: mockUser.gamesWon,
        createdAt: mockUser.createdAt,
      };

      prismaService.user.findUnique = jest
        .fn()
        .mockResolvedValue(userWithoutPassword);

      const result = await service.findById("user-id-1");

      expect(result).toEqual(userWithoutPassword);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-id-1" },
        select: {
          id: true,
          username: true,
          gamesPlayed: true,
          gamesWon: true,
          createdAt: true,
        },
      });
    });

    it("should return null for non-existent user", async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      const result = await service.findById("non-existent-id");

      expect(result).toBeNull();
    });
  });
});
