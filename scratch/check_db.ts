import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const history = await prisma.watchHistory.findMany({ take: 5 });
  console.log(history);
}
main().finally(() => prisma.$disconnect());
