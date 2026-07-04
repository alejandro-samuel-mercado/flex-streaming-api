import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const deleted = await prisma.videoFile.deleteMany({
    where: { status: { in: ['FAILED', 'PENDING', 'QUEUED', 'PROCESSING'] } }
  });
  console.log('Borrados totales (FAILED, PENDING, QUEUED, PROCESSING):', deleted.count);
  const resetContent = await prisma.content.updateMany({
      where: { status: { in: ['ERROR', 'PROCESSING'] } },
      data: { status: 'PENDING' }
  });
  console.log('Reset content:', resetContent.count);
}
main().finally(() => prisma.$disconnect());
