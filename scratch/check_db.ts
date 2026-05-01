import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const activeCount = await prisma.content.count({ where: { status: 'ACTIVE' } });
  const totalCount = await prisma.content.count();
  const platforms = await prisma.platform.findMany({
    include: { _count: { select: { contents: true } } }
  });
  
  console.log('--- DATABASE STATS ---');
  console.log('Total Content:', totalCount);
  console.log('Active Content:', activeCount);
  console.log('Platforms and Content Count:');
  platforms.forEach(p => {
    console.log(`- ${p.name} (ID: ${p.id}): ${p._count.contents} items`);
  });
}

main().finally(() => prisma.$disconnect());
