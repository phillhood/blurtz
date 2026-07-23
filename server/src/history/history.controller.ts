import { Controller, Get, Param, Request, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";
import { GameIdParamDto } from "@game/dto";
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

  @Get(":id/results")
  @ApiOperation({ summary: "Get a game's round-by-round results (members only)" })
  async getResults(@Param() params: GameIdParamDto, @Request() req): Promise<ApiResponse> {
    const data = await this.historyService.getGameResults(params.id, req.user.sub);
    return { success: true, data };
  }
}
