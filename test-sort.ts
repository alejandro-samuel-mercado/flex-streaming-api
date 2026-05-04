import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const contents = await prisma.content.findMany({
    orderBy: { title: 'asc' },
    select: { title: true, slug: true }
  });
  console.log(contents);
}
main().finally(() => prisma.$disconnect());
