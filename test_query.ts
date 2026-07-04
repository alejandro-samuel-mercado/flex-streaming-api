import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.content.findFirst({
    where: { translations: { some: { title: { contains: 'Going in Style' } } } },
    include: { translations: true, thumbnails: true, videoFiles: true, genres: true }
  });
  console.log(JSON.stringify(c, null, 2));
}
run().finally(() => process.exit(0));
