import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    // Interactive transactions hold their connection for the whole callback, and
    // every game mutation runs inside one. pg's default max of 10 would have
    // concurrent moves queueing for a connection before they even reach the row
    // lock.
    const pool = new Pool({ connectionString, max: 20 });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // The pool is ours - we constructed it and handed it to the adapter, so
    // $disconnect does not close it. Left open, its sockets keep the process
    // alive.
    await this.pool.end();
  }
}
