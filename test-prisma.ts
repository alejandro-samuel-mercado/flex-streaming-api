import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const data = await prisma.content.findMany({
    where: {
      AND: [
        { deletedAt: null },
        { featured: true }
      ]
    },
    select: { id: true, featured: true }
  });
  console.log(data);
}
main().finally(() => prisma.$disconnect());
