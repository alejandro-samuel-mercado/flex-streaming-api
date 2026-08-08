import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
async function run() {
  const vfs = await prisma.videoFile.findMany({
    where: { type: 'MOVIE' },
    include: { content: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(vfs.map(v => ({ id: v.id, originalPath: v.originalPath, contentTitle: v.content?.title })));
}
run().finally(() => process.exit(0));
