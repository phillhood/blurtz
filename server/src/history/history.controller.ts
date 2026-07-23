import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";
import { ApiResponse } from "@types";
import { HistoryService } from "./history.service";

@ApiTags("game")
@ApiBearerAuth()
@Controller("game")
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  @Get("history")
  @ApiOperation({ summary: "Get the current user's finished games" })
  async getHistory(@Request() req): Promise<ApiResponse> {
    const data = await this.historyService.getMatchHistory(req.user.sub);
    return { success: true, data };
  }
}
