import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// Shared PrismaClient instance (lazy or instantiated on demand)
let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prismaInstance;
}

export const prisma = getPrismaClient();
export const db = prisma;

export * from './ingestion';

