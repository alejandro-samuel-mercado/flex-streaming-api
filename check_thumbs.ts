import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const thumbs = await prisma.thumbnail.findMany({
    orderBy: { id: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(thumbs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
