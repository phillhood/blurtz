import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  ConflictException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: "user-id-1",
    username: "testuser",
    gamesPlayed: 0,
    gamesWon: 0,
    cardSkin: "solid" as const,
    createdAt: new Date(),
  };

  const mockAuthResponse = {
    user: mockUser,
    token: "mock-jwt-token",
  };

  beforeEach(async () => {
    const mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("register", () => {
    const registerDto = { username: "testuser", password: "password123" };

    it("should register a new user successfully", async () => {
      authService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it("propagates the service's 409 Conflict when username already exists", async () => {
      authService.register.mockRejectedValue(
        new ConflictException("Username already exists")
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        ConflictException
      );
      await expect(controller.register(registerDto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it("propagates unexpected errors from the service unchanged", async () => {
      const err = new Error("Some other error");
      authService.register.mockRejectedValue(err);

      await expect(controller.register(registerDto)).rejects.toBe(err);
    });
  });

  describe("login", () => {
    const loginDto = { username: "testuser", password: "password123" };

    it("should login successfully with valid credentials", async () => {
      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });

    it("propagates the service's 401 Unauthorized for invalid credentials", async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException("Invalid credentials")
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(controller.login(loginDto)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it("propagates unexpected errors from the service unchanged", async () => {
      const err = new Error("Some other error");
      authService.login.mockRejectedValue(err);

      await expect(controller.login(loginDto)).rejects.toBe(err);
    });
  });

  describe("getProfile", () => {
    const mockRequest = {
      user: { sub: "user-id-1", username: "testuser" },
    };

    it("should return user profile", async () => {
      authService.findById.mockResolvedValue(mockUser);

      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(mockUser);
      expect(authService.findById).toHaveBeenCalledWith("user-id-1");
    });

    it("should throw 404 Not Found if user does not exist", async () => {
      authService.findById.mockResolvedValue(null);

      await expect(controller.getProfile(mockRequest)).rejects.toThrow(
        NotFoundException
      );
      await expect(controller.getProfile(mockRequest)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it("propagates unexpected errors from findById unchanged", async () => {
      const err = new Error("Database error");
      authService.findById.mockRejectedValue(err);

      await expect(controller.getProfile(mockRequest)).rejects.toBe(err);
    });
  });

  describe("logout", () => {
    it("should return success message", async () => {
      const result = await controller.logout();

      expect(result).toEqual({ message: "Logout successful" });
    });
  });
});
