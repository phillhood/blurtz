import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { ServerOptions } from "socket.io";

class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) =>
      console.error("Redis Pub Client Error:", err)
    );
    subClient.on("error", (err) =>
      console.error("Redis Sub Client Error:", err)
    );

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // Configure Redis adapter for Socket.IO if Redis is available
  if (process.env.REDIS_URL || process.env.USE_REDIS_ADAPTER === "true") {
    const redisIoAdapter = new RedisIoAdapter(app);
    try {
      await redisIoAdapter.connectToRedis();
      app.useWebSocketAdapter(redisIoAdapter);
    } catch (error) {
      console.warn("Redis adapter failed to connect, using default adapter:", error);
    }
  }

  app.enableCors({
    origin: process.env.NODE_ENV === "development" ? true : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.setGlobalPrefix("api");

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle("Blurtz API")
    .setDescription("API for the Blurtz multiplayer card game")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
}

bootstrap();
