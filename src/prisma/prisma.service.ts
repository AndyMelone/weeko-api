import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { pgAdapter } from './adapter';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error('DATABASE_URL manquant (voir .env.example)');
    super({ adapter: pgAdapter(connectionString) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
