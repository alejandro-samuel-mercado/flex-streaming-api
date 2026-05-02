import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const c1 = await prisma.content.findFirst({ where: { slug: 'the-avengers-e1tm' } });
  console.log("Slug fetch:", c1 ? c1.id : "null");
}
run().finally(() => prisma.$disconnect());
