import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const siteConfig = await prisma.siteConfig.findMany();
  const config = Object.fromEntries(siteConfig.map(c => [c.key, c.value]));
  
  console.log('Strategy:', config['home_banner_strategy']);
  console.log('IDs Raw:', config['home_banner_ids']);
  
  const explicitIds = config['home_banner_ids'] ? JSON.parse(config['home_banner_ids']) : [];
  console.log('Parsed IDs:', explicitIds);
  
  const activeContentWhere = {
    status: { in: ['READY', 'ACTIVE'] as any },
    deletedAt: null,
  };
  
  const manualItems = await prisma.content.findMany({
    where: { id: { in: explicitIds }, ...activeContentWhere },
  });
  
  console.log('Items found:', manualItems.length);
  manualItems.forEach(i => console.log(`- ${i.id}: ${i.status}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
