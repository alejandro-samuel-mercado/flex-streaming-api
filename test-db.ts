import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.content.findMany({
    where: { status: 'PENDING' },
    select: { id: true, title: true, status: true }
  });
  console.log('Pending in DB:', pending.length);

  const activeContentWhere = {
    status: { in: ['READY', 'ACTIVE'] as any },
    deletedAt: null,
  };
  const hpRecent = await prisma.content.findMany({
    where: activeContentWhere,
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  console.log('Homepage Recent with PENDING status?:', hpRecent.filter(c => c.status === 'PENDING').length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
