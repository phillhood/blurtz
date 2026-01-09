import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HttpException, HttpStatus } from "@nestjs/common";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: "user-id-1",
    username: "testuser",
    gamesPlayed: 0,
    gamesWon: 0,
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

    it("should throw 409 Conflict if username already exists", async () => {
      authService.register.mockRejectedValue(
        new Error("Username already exists")
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        HttpException
      );
      await expect(controller.register(registerDto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it("should throw 400 Bad Request for other errors", async () => {
      authService.register.mockRejectedValue(new Error("Some other error"));

      await expect(controller.register(registerDto)).rejects.toThrow(
        HttpException
      );
      await expect(controller.register(registerDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
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

    it("should throw 401 Unauthorized for invalid credentials", async () => {
      authService.login.mockRejectedValue(new Error("Invalid credentials"));

      await expect(controller.login(loginDto)).rejects.toThrow(HttpException);
      await expect(controller.login(loginDto)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it("should throw 400 Bad Request for other errors", async () => {
      authService.login.mockRejectedValue(new Error("Some other error"));

      await expect(controller.login(loginDto)).rejects.toThrow(HttpException);
      await expect(controller.login(loginDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
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
        HttpException
      );
      await expect(controller.getProfile(mockRequest)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it("should throw 500 Internal Server Error for unexpected errors", async () => {
      authService.findById.mockRejectedValue(new Error("Database error"));

      await expect(controller.getProfile(mockRequest)).rejects.toThrow(
        HttpException
      );
      await expect(controller.getProfile(mockRequest)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe("logout", () => {
    it("should return success message", async () => {
      const result = await controller.logout();

      expect(result).toEqual({ message: "Logout successful" });
    });
  });
});
