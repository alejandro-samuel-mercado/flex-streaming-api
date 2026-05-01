import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const content = await prisma.content.findFirst({
    where: { platformId: { not: null } },
    select: { id: true, platformId: true, platform: { select: { name: true } } }
  });
  
  console.log('--- SAMPLE CONTENT ---');
  console.log(content);

  const allPlatforms = await prisma.platform.findMany({ select: { id: true, name: true, slug: true } });
  console.log('--- ALL PLATFORMS ---');
  console.log(allPlatforms);
}

main().finally(() => prisma.$disconnect());
