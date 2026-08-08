import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from './src/shared/config/prisma';
async function test() {
  const activeMovies = await prisma.content.findMany({
    where: { status: 'PENDING' },
    include: { videoFiles: true },
    take: 5
  });
  console.log(JSON.stringify(activeMovies, null, 2));
}
test().then(() => console.log('Done')).catch(console.error);
