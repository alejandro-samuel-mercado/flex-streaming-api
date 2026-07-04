import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const epCount = await prisma.episode.count();
  const cCount = await prisma.content.count();
  console.log(`Episodios actuales en DB: ${epCount}`);
  console.log(`Contenidos actuales en DB: ${cCount}`);
}
main().finally(() => prisma.$disconnect());
