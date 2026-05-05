import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.videoFile.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'FAILED' }
  });
  console.log(`Marcados ${result.count} videos atascados como FAILED.`);
}
main().finally(() => prisma.$disconnect());
