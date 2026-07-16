import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UserService } from "./user.service";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";
import { ApiResponse } from "@types";

@ApiTags("user")
@ApiBearerAuth()
@Controller("user")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get user profile" })
  @SwaggerResponse({ status: 200, description: "Profile retrieved successfully" })
  @SwaggerResponse({ status: 401, description: "Unauthorized" })
  async getProfile(@Request() req): Promise<ApiResponse> {
    const profile = await this.userService.getProfile(req.user.sub);
    return {
      success: true,
      data: profile,
    };
  }

  @Get("stats")
  @ApiOperation({ summary: "Get user game statistics" })
  @SwaggerResponse({ status: 200, description: "Stats retrieved successfully" })
  @SwaggerResponse({ status: 401, description: "Unauthorized" })
  async getStats(@Request() req): Promise<ApiResponse> {
    const stats = await this.userService.getStats(req.user.sub);
    return {
      success: true,
      data: stats,
    };
  }
}
