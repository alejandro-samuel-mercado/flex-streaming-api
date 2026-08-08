import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
async function test() {
  const vq = await prisma.videoQuality.findMany({
    take: 10,
    orderBy: { id: 'desc' },
    select: { resolution: true, height: true, width: true }
  });
  console.log(vq);
}
test().finally(() => process.exit(0));
