const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const contents = await prisma.content.findMany({
    include: {
      videoFiles: true,
      translations: { where: { language: 'es' } }
    }
  });

  for (const c of contents) {
    if (c.videoFiles.length > 0) {
        console.log(`Title: ${c.translations?.[0]?.title || c.slug} | Type: ${c.type} | VideoFiles: ${c.videoFiles.length}`);
    }
  }
}

check().catch(e => console.error(e)).finally(() => prisma.$disconnect());
