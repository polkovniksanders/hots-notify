import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../generated/prisma/client';

// Singleton — один экземпляр на весь процесс
let prisma: InstanceType<typeof PrismaClient> | null = null;

export function getPrisma(): InstanceType<typeof PrismaClient> {
  if (!prisma) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Missing required env variable: DATABASE_URL');
    }
    const adapter = new PrismaLibSql({ url: databaseUrl });
    prisma = new PrismaClient({ adapter } as never);
  }
  return prisma;
}
