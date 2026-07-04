import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const content = await prisma.content.findFirst({
    where: { translations: { some: { title: { contains: 'Milagro en la celda 7' } } } },
    include: { translations: true, genres: true, thumbnails: true, videoFiles: true }
  });
  console.log(JSON.stringify(content, null, 2));
}
main().finally(() => prisma.$disconnect());
