/**
 * reset_catalogo_completo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Borra TODOS los registros de contenido (películas, series, episodios,
 * videoFiles) de la base de datos.
 *
 * NO toca: usuarios, membresías, planes, configuraciones del sitio.
 *
 * Ejecutar en el Servidor Cerebro:
 *   npx tsx scripts/reset_catalogo_completo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

function pregunta(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin as any, output: process.stdout as any });
  return new Promise(resolve => rl.question(prompt, (ans: string) => { rl.close(); resolve(ans); }));
}

async function resetCatalogo() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   RESET CATÁLOGO — BASE DE DATOS                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Contar registros actuales
  const [
    totalContent, totalEpisodes, totalSeasons,
    totalVideoFiles, totalThumbs, totalSubtitles,
    totalAudios, totalWatchHistory, totalFavorites, totalReviews
  ] = await Promise.all([
    prisma.content.count(),
    prisma.episode.count(),
    prisma.season.count(),
    prisma.videoFile.count(),
    prisma.thumbnail.count(),
    prisma.subtitleTrack.count(),
    prisma.audioTrack.count(),
    prisma.watchHistory.count(),
    prisma.favorite.count(),
    prisma.review.count(),
  ]);

  console.log('📊 Estado actual de la base de datos:');
  console.log(`   Content (películas/series): ${totalContent}`);
  console.log(`   Seasons:                    ${totalSeasons}`);
  console.log(`   Episodes:                   ${totalEpisodes}`);
  console.log(`   VideoFiles:                 ${totalVideoFiles}`);
  console.log(`   Thumbnails:                 ${totalThumbs}`);
  console.log(`   SubtitleTracks:             ${totalSubtitles}`);
  console.log(`   AudioTracks:                ${totalAudios}`);
  console.log(`   WatchHistory:               ${totalWatchHistory}`);
  console.log(`   Favorites:                  ${totalFavorites}`);
  console.log(`   Reviews:                    ${totalReviews}`);
  console.log('');
  console.log('⚠️  ATENCIÓN: Esto borrará TODO el catálogo de contenido.');
  console.log('   Los usuarios, membresías y planes NO se tocan.');
  console.log('');

  const confirm = await pregunta("¿Confirmar borrado? (escribe 'BORRAR TODO' para continuar): ");
  if (confirm !== 'BORRAR TODO') {
    console.log('Cancelado.');
    process.exit(0);
  }

  console.log('');
  console.log('🗑️  Borrando en orden para respetar foreign keys...');

  // Borrar en orden correcto (de hijos a padres)
  console.log('   Borrando historial de reproducción...');
  await prisma.watchHistory.deleteMany({});
  await prisma.watchSession.deleteMany({});

  console.log('   Borrando favoritos y listas...');
  await prisma.favorite.deleteMany({});
  await prisma.myList.deleteMany({});
  await prisma.like.deleteMany({});

  console.log('   Borrando reseñas y comentarios...');
  await prisma.review.deleteMany({});
  await prisma.comment.deleteMany({});

  console.log('   Borrando pistas de subtítulos...');
  await prisma.subtitleTrack.deleteMany({});

  console.log('   Borrando pistas de audio...');
  await prisma.audioTrack.deleteMany({});

  console.log('   Borrando calidades de video...');
  await prisma.videoQuality.deleteMany({});

  console.log('   Borrando archivos de video...');
  await prisma.videoFile.deleteMany({});

  console.log('   Borrando miniaturas...');
  await prisma.thumbnail.deleteMany({});

  console.log('   Borrando traducciones de episodios...');
  await prisma.episodeTranslation.deleteMany({});

  console.log('   Borrando episodios...');
  await prisma.episode.deleteMany({});

  console.log('   Borrando traducciones de temporadas...');
  await prisma.seasonTranslation.deleteMany({});

  console.log('   Borrando temporadas...');
  await prisma.season.deleteMany({});

  console.log('   Borrando géneros de contenido...');
  await prisma.contentGenre.deleteMany({});

  console.log('   Borrando tags de contenido...');
  await prisma.contentTag.deleteMany({});

  console.log('   Borrando actores de contenido...');
  await prisma.contentActor.deleteMany({});

  console.log('   Borrando directores de contenido...');
  await prisma.contentDirector.deleteMany({});

  console.log('   Borrando traducciones de contenido...');
  await prisma.contentTranslation.deleteMany({});

  console.log('   Borrando items de recomendaciones...');
  await prisma.recommendationItem.deleteMany({});

  console.log('   Borrando rentals...');
  await prisma.rental.deleteMany({});

  console.log('   Borrando anuncios y targets...');
  await prisma.adTarget.deleteMany({});

  console.log('   Borrando contenido principal...');
  await prisma.content.deleteMany({});

  // Resetear el estado del auto-scanner
  await prisma.siteConfig.deleteMany({
    where: { key: { in: ['AUTO_SCAN_LAST_RUN', 'AUTO_SCAN_LAST_RESULT'] } }
  });

  console.log('');
  console.log('✅ Catálogo limpio. Base de datos lista para re-importar desde cero.');
  console.log('   Próximo paso: ejecutar escanear_peliculas.ts y escanear_series.ts');
  console.log('');
}

resetCatalogo()
  .catch(err => { console.error('❌ Error fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
