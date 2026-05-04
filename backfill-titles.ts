import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const contents = await prisma.content.findMany({
    include: { translations: true }
  });
  for (const c of contents) {
    const title = c.translations.find(t => t.language === 'es')?.title || c.translations[0]?.title || c.originalTitle || c.slug;
    await prisma.content.update({
      where: { id: c.id },
      data: { title }
    });
  }
  console.log('Backfill completed for ' + contents.length + ' items');
}
main().finally(() => prisma.$disconnect());
