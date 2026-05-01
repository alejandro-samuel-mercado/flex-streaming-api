import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ids = ["cmom3ppu20003901yiuqla343","cmokp4y0p000xu22lssz2clp6","cmokp4xzb000iu22ly434qh3n"];
  const contents = await prisma.content.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, translations: { select: { title: true } } }
  });
  console.log('--- Content Status ---');
  contents.forEach(c => {
    console.log(`ID: ${c.id}, Status: ${c.status}, Title: ${c.translations[0]?.title}`);
  });
  console.log('----------------------');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
