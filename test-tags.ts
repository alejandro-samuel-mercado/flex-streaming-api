import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const data = await prisma.contentTag.findMany();
  console.log(data);
}
main().finally(() => prisma.$disconnect());
