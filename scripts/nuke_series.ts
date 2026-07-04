import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('☢️  Iniciando Aniquilación Total de Series en Base de Datos...');

  try {
    const series = await prisma.content.findMany({ where: { type: 'SERIES', isPinned: false } });
    console.log(`Borrando ${series.length} series... (Las fijadas serán ignoradas)`);

    // Al borrar el Content, Prisma borra en cascada Seasons, Episodes, y VideoFiles (si la BD está bien configurada).
    // Pero por si acaso, borramos primero los videos de episodios.
    const pinnedSeries = await prisma.content.findMany({ where: { type: 'SERIES', isPinned: true }, select: { id: true } });
    const pinnedSeriesIds = pinnedSeries.map(s => s.id);
    const contentFilter = pinnedSeriesIds.length > 0 ? { contentId: { notIn: pinnedSeriesIds } } : {};
    const seasonFilter = pinnedSeriesIds.length > 0 ? { season: { contentId: { notIn: pinnedSeriesIds } } } : {};

    await prisma.videoFile.deleteMany({ where: { type: 'EPISODE', ...contentFilter } });
    await prisma.episode.deleteMany({ where: seasonFilter });
    await prisma.season.deleteMany({ where: contentFilter });
    await prisma.content.deleteMany({ where: { type: 'SERIES', isPinned: false } });

    console.log('✅ ¡Base de datos de series purgada y lista para un inicio limpio!');
    console.log('➡️ AHORA SÍ, corre "npx tsx escanear_series.ts"');
  } catch (err) {
    console.error('Error purgando DB:', err);
  }
}

run().finally(() => process.exit(0));
