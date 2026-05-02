import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.videoFile.findMany({
    select: {
      id: true,
      status: true,
      processingJobId: true,
      content: { select: { slug: true } }
    }
  });
  console.log("Videos in DB:");
  console.log(JSON.stringify(videos, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
