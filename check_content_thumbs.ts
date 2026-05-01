import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const contentWithThumbs = await prisma.content.findMany({
    where: { thumbnails: { some: {} } },
    include: { thumbnails: true },
    take: 5
  });
  console.log(JSON.stringify(contentWithThumbs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
