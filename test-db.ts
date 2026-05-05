import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const videos = await prisma.videoFile.findMany({ where: { status: 'PROCESSING' } });
  console.log(JSON.stringify(videos, null, 2));
}
main().finally(() => prisma.$disconnect());
