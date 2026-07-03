import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function run() {
  const contents = await prisma.content.findMany({
    where: {
      slug: { in: [
        'piratas-del-caribe-ii-el-cofre-del-hombre-muerto-chme',
        'not-okay-5jtd',
        'messi-la-cinta-olvidada-d83f',
        'iron-man-2-k6in'
      ]}
    },
    include: { thumbnails: true }
  });

  for (const c of contents) {
    console.log(`\nSlug: ${c.slug}`);
    console.log(`Status: ${c.status}`);
    console.log(`Thumbnails count: ${c.thumbnails.length}`);
    for (const t of c.thumbnails) {
      console.log(` - [${t.type}] ${t.url}`);
    }
  }
}
run();
