const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const contents = await prisma.content.findMany({
    include: {
      translations: { where: { language: 'es' } }
    }
  });

  console.log(`Total contents: ${contents.length}`);
  for (const c of contents) {
    console.log(`- ${c.translations?.[0]?.title || c.slug} (${c.type})`);
  }
}

check().catch(e => console.error(e)).finally(() => prisma.$disconnect());
