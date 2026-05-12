import { prisma } from '../shared/config/prisma';

async function test() {
  const contents = await prisma.content.findMany();
  console.log('Total contents:', contents.length);
  if (contents.length > 0) {
    console.log('All contents:', contents.map(c => ({ id: c.id, slug: c.slug, tmdbId: c.tmdbId, status: c.status })));
  }
}

test()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
