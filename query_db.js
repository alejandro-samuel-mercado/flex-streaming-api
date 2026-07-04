const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.endUserAccount.findMany({
    where: { OR: [{ endDate: { gte: new Date('2026-09-01') } }, { endDate: { gte: new Date('2027-02-01') } }] },
    select: { id: true, username: true, status: true, endDate: true, userId: true, user: { select: { id: true, phone: true } } }
  });
  console.log(JSON.stringify(accounts, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
