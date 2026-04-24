import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaMode?: "pg-adapter" | "accelerate";
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/drivxis?schema=public";

const shouldUsePgAdapter =
  connectionString.startsWith("postgresql://") || connectionString.startsWith("postgres://");

const prismaMode = shouldUsePgAdapter ? "pg-adapter" : "accelerate";

function createPrismaClient() {
  const adapter = shouldUsePgAdapter ? new PrismaPg({ connectionString }) : undefined;

  return new PrismaClient({
    ...(adapter ? { adapter } : {}),
    ...(!adapter ? { accelerateUrl: connectionString } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

if (globalForPrisma.prisma && globalForPrisma.prismaMode && globalForPrisma.prismaMode !== prismaMode) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaMode = prismaMode;
}
