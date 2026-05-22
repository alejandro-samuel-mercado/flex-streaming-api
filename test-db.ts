import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const allContents = await prisma.content.findMany({
    include: { translations: true }
  });
  console.log(allContents.map(c => ({
    id: c.id,
    type: c.type,
    tmdbId: c.tmdbId,
    title: c.translations[0]?.title
  })));
}
main().finally(() => prisma.$disconnect());
