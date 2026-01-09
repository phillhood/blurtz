import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { RedisService } from "@redis";

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const client = this.redis.getClient();
      await client.ping();
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        "Redis health check failed",
        this.getStatus(key, false, { message: error.message })
      );
    }
  }
}
