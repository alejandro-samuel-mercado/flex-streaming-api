import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.content.groupBy({
    by: ['platformId'],
    _count: { _all: true },
  });
  
  console.log('--- CONTENT BY PLATFORM ID ---');
  console.log(counts);

  const platforms = await prisma.platform.findMany();
  console.log('--- PLATFORMS ---');
  console.log(platforms.map(p => ({ id: p.id, name: p.name })));
}

main().finally(() => prisma.$disconnect());
