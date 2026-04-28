import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const contents = await prisma.content.findMany({
    include: { translations: true }
  });
  console.log('Total content records:', contents.length);
  console.log(JSON.stringify(contents, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
