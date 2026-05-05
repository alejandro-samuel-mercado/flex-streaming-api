import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const contents = await prisma.content.findMany({
    take: 5,
    select: { id: true, slug: true, originalTitle: true, title: true }
  });
  console.log('Sample content from DB:');
  console.log(JSON.stringify(contents, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
