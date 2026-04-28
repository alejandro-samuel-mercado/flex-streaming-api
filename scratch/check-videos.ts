import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.videoFile.findMany();
  console.log('Total video files:', videos.length);
  console.log(JSON.stringify(videos, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
