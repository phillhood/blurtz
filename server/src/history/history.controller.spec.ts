import { Test } from "@nestjs/testing";
import { HistoryController } from "./history.controller";
import { HistoryService } from "./history.service";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";

describe("HistoryController", () => {
  let controller: HistoryController;
  const historyService = { getMatchHistory: jest.fn(), getGameResults: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [{ provide: HistoryService, useValue: historyService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(HistoryController);
  });

  it("wraps the match history for the requesting user", async () => {
    historyService.getMatchHistory.mockResolvedValue([{ gameId: "g1" }]);
    const res = await controller.getHistory({ user: { sub: "u-me" } });
    expect(historyService.getMatchHistory).toHaveBeenCalledWith("u-me");
    expect(res).toEqual({ success: true, data: [{ gameId: "g1" }] });
  });

  it("wraps a game's results, passing the id and the requesting user", async () => {
    historyService.getGameResults.mockResolvedValue({ gameId: "g1", rounds: [] });
    const res = await controller.getResults({ id: "g1" }, { user: { sub: "u-me" } });
    expect(historyService.getGameResults).toHaveBeenCalledWith("g1", "u-me");
    expect(res).toEqual({ success: true, data: { gameId: "g1", rounds: [] } });
  });
});
