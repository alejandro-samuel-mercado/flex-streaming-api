import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const contents = await prisma.content.findMany({
    where: { 
      type: 'SERIES',
      deletedAt: null
    },
    include: {
      translations: true,
      videoFiles: true,
      episodes: { include: { videoFile: true } }
    }
  });

  const titles = new Map<string, typeof contents>();
  
  for (const c of contents) {
    const t = c.translations.find(tr => tr.language === 'es')?.title.toLowerCase().trim();
    if (!t) continue;
    if (!titles.has(t)) titles.set(t, []);
    titles.get(t)!.push(c);
  }

  for (const [title, list] of titles.entries()) {
    if (list.length > 1) {
      console.log(`\nDUPLICADO ENCONTRADO: "${title}" (${list.length} versiones)`);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const vfs = c.episodes.filter(ep => ep.videoFile).length;
        console.log(`  [Versión ${i+1}] ID: ${c.id} - Pinned: ${c.isPinned} - Status: ${c.status} - Episodios con VideoFile: ${vfs}`);
      }
    }
  }

  process.exit(0);
}
main();
