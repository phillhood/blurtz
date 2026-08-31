import { Body, Controller, Get, NotFoundException, Patch, Post, Request, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginDto, RegisterDto, UpdatePreferencesDto } from "./dto";

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
    return this.authService.register(registerData);
  }

  @Post("login")
  @ApiOperation({ summary: "Login with credentials" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } }) // 1/sec, 10/min
  async login(@Body() loginData: LoginDto) {
    return this.authService.login(loginData);
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "Profile retrieved successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getProfile(@Request() req) {
    const user = await this.authService.findById(req.user.sub);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  @Patch("preferences")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update display preferences" })
  @ApiResponse({ status: 200, description: "Preferences updated" })
  @ApiResponse({ status: 400, description: "Invalid preference value" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async updatePreferences(
    @Request() req,
    @Body() preferences: UpdatePreferencesDto
  ) {
    return this.authService.updatePreferences(req.user.sub, preferences);
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
