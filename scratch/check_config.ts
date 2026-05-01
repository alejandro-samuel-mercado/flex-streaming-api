import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.siteConfig.findMany();
  console.log('--- SiteConfig ---');
  configs.forEach(c => {
    console.log(`${c.key}: ${c.value}`);
  });
  console.log('------------------');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
