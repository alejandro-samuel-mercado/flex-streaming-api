import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('☢️  Iniciando Aniquilación Total de Series en Base de Datos...');

  try {
    const series = await prisma.content.findMany({ where: { type: 'SERIES' } });
    console.log(`Borrando ${series.length} series...`);

    // Al borrar el Content, Prisma borra en cascada Seasons, Episodes, y VideoFiles (si la BD está bien configurada).
    // Pero por si acaso, borramos primero los videos de episodios.
    await prisma.videoFile.deleteMany({ where: { type: 'EPISODE' } });
    await prisma.episode.deleteMany({});
    await prisma.season.deleteMany({});
    await prisma.content.deleteMany({ where: { type: 'SERIES' } });

    console.log('✅ ¡Base de datos de series purgada y lista para un inicio limpio!');
    console.log('➡️ AHORA SÍ, corre "npx tsx escanear_series.ts"');
  } catch (err) {
    console.error('Error purgando DB:', err);
  }
}

run().finally(() => process.exit(0));
