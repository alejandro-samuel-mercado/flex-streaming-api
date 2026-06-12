import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://peliplus:peliplus_secret@129.121.32.195:5433/peliplus?schema=public" } } });

async function run() {
  const series = await prisma.videoFile.findMany({
    where: { episodeId: { not: null } },
    select: { id: true }
  });
  fs.writeFileSync('series_ids.txt', series.map(s => s.id).join('\n'));

  const movies = await prisma.videoFile.findMany({
    where: { episodeId: null, contentId: { not: null } },
    select: { id: true }
  });
  fs.writeFileSync('movies_ids.txt', movies.map(m => m.id).join('\n'));
}
run().finally(() => prisma.$disconnect());
