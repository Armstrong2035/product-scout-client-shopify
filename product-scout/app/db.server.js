import { PrismaClient } from "@prisma/client";

const prisma = global.prismaGlobal ?? new PrismaClient({
  log: ['query', 'error', 'warn'],
});

if (process.env["NODE_ENV"] !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = prisma;
  }
}

// Log connection attempts to help debug Vercel issues
console.log("[Prisma] Client initialized with database url defined");

export default prisma;
