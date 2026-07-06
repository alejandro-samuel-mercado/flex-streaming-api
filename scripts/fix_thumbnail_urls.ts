import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Sincronizando URLs de miniaturas rotas (de relativas a absolutas)...');
  
  const thumbnails = await prisma.thumbnail.findMany();
  let count = 0;
  
  for (const t of thumbnails) {
    if (t.url.startsWith('/media/thumbnails/series/')) {
      const absoluteUrl = `https://series-streamflex.unixxtech.online${t.url}`;
      await prisma.thumbnail.update({
        where: { id: t.id },
        data: { url: absoluteUrl }
      });
      console.log(`✅ Serie actualizada: "${t.url}" ➡️ "${absoluteUrl}"`);
      count++;
    } else if (t.url.startsWith('/media/thumbnails/peliculas/')) {
      const absoluteUrl = `https://peliculas-streamflex.unixxtech.online${t.url}`;
      await prisma.thumbnail.update({
        where: { id: t.id },
        data: { url: absoluteUrl }
      });
      console.log(`✅ Película actualizada: "${t.url}" ➡️ "${absoluteUrl}"`);
      count++;
    }
  }

  console.log(`\n🎉 Proceso terminado. Se actualizaron ${count} URLs de miniaturas.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
