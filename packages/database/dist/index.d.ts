import { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
export declare function getPrismaClient(): PrismaClient;
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare const db: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export * from './ingestion';
