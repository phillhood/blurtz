import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RegisterDto, LoginDto } from "./dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({ status: 201, description: "User registered successfully" })
  @ApiResponse({ status: 409, description: "User already exists" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 5, ttl: 60000 } }) // 1/sec, 5/min
  async register(@Body() registerData: RegisterDto) {
    try {
      const result = await this.authService.register(registerData);
      return result;
    } catch (error) {
      if (
        error.message.includes("already exists") ||
        error.message.includes("duplicate")
      ) {
        throw new HttpException(
          error.message || "User already exists",
          HttpStatus.CONFLICT
        );
      }
      throw new HttpException(
        error.message || "Registration failed",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post("login")
  @ApiOperation({ summary: "Login with credentials" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } }) // 1/sec, 10/min
  async login(@Body() loginData: LoginDto) {
    try {
      const result = await this.authService.login(loginData);
      return result;
    } catch (error) {
      // TODO - fix jank with proper error types
      if (
        error.message.includes("Invalid credentials") ||
        error.message.includes("not found")
      ) {
        throw new HttpException("Invalid credentials", HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        error.message || "Login failed",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "Profile retrieved successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getProfile(@Request() req) {
    try {
      const user = await this.authService.findById(req.user.sub);
      if (!user) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND);
      }
      return user;
    } catch (error) {
      if (error.status) {
        throw error;
      }
      throw new HttpException(
        error.message || "Profile fetch failed",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout current user" })
  @ApiResponse({ status: 200, description: "Logout successful" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async logout() {
    return { message: "Logout successful" };
  }
}
