import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { createClient, RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private publisher: RedisClientType;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    this.client = createClient({ url: redisUrl });
    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    this.client.on("error", (err) =>
      console.error("Redis Client Error:", err)
    );
    this.subscriber.on("error", (err) =>
      console.error("Redis Subscriber Error:", err)
    );
    this.publisher.on("error", (err) =>
      console.error("Redis Publisher Error:", err)
    );

    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client?.quit(),
      this.subscriber?.quit(),
      this.publisher?.quit(),
    ]);
  }

  getClient(): RedisClientType {
    return this.client;
  }

  getSubscriber(): RedisClientType {
    return this.subscriber;
  }

  getPublisher(): RedisClientType {
    return this.publisher;
  }

  async get(key: string): Promise<string | null> {
    const result = await this.client.get(key);
    return typeof result === 'string' ? result : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }
}
