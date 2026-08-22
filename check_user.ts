import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.endUserAccount.findMany({
    where: { username: { equals: 'carlale', mode: 'insensitive' } },
    select: { id: true, username: true, deletedAt: true, status: true, planId: true }
  });
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
