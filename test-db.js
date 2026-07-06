const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const content = await prisma.content.findMany({
    where: { slug: { contains: 'the-flash' } },
    include: { videoFiles: true, seasons: { include: { episodes: true } } }
  });
  console.log(JSON.stringify(content, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
