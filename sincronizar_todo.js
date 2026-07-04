require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Analizando la base de datos completa...');

  // 1. Encontrar TODO el contenido (Series/Pelis) que NO tiene videos listos.
  const allContent = await prisma.content.findMany({
    include: {
      videoFiles: true,
      seasons: { include: { episodes: { include: { videoFiles: true } } } }
    }
  });

  let aPending = 0;
  let aActive = 0;

  for (const c of allContent) {
    let tieneVideoListo = false;

    if (c.type === 'MOVIE') {
      tieneVideoListo = c.videoFiles.some(v => v.status === 'COMPLETED');
    } else {
      for (const s of c.seasons) {
        for (const e of s.episodes) {
          if (e.videoFiles.some(v => v.status === 'COMPLETED')) {
            tieneVideoListo = true;
            break;
          }
        }
        if (tieneVideoListo) break;
      }
    }

    if (!tieneVideoListo && c.status !== 'PENDING') {
      // No tiene video listo, pero NO está en PENDING. Lo regresamos a PENDING.
      await prisma.content.update({ where: { id: c.id }, data: { status: 'PENDING' } });
      aPending++;
    } else if (tieneVideoListo && c.status !== 'ACTIVE') {
      // Tiene video listo, pero NO está en ACTIVE. Lo ponemos en ACTIVE.
      await prisma.content.update({ where: { id: c.id }, data: { status: 'ACTIVE' } });
      aActive++;
    }
  }

  console.log(`\n✅ Base de datos saneada:`);
  console.log(`  ➡️ ${aPending} contenidos que NO tenían video fueron regresados a PENDING.`);
  console.log(`  ➡️ ${aActive} contenidos que SÍ tenían video fueron publicados (ACTIVE).`);
  console.log('\nAhora el panel refleja el 100% de la realidad.');
}

main().catch(console.error).finally(() => process.exit(0));
