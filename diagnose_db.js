require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('=== DIAGNÓSTICO DE BASE DE DATOS ===\n');

  const seriesTypes = ['SERIES', 'ANIME', 'ANIMATION', 'NOVELA', 'REALITY_SHOW', 'DOCUMENTARY', 'KIDS', 'FAMILY'];

  // 1. Conteos generales
  const [totalContent, totalMovies, totalSeries, totalSeasons, totalEpisodes, totalVF, vfWithContent, vfWithEpisode] = await Promise.all([
    prisma.content.count(),
    prisma.content.count({ where: { type: 'MOVIE' } }),
    prisma.content.count({ where: { type: { in: seriesTypes } } }),
    prisma.season.count(),
    prisma.episode.count(),
    prisma.videoFile.count(),
    prisma.videoFile.count({ where: { contentId: { not: null } } }),
    prisma.videoFile.count({ where: { episodeId: { not: null } } }),
  ]);

  console.log('CONTEOS GENERALES:');
  console.log('  Total contenidos:', totalContent);
  console.log('  Películas:', totalMovies);
  console.log('  Series/Anime/etc:', totalSeries);
  console.log('  Temporadas:', totalSeasons);
  console.log('  Episodios:', totalEpisodes);
  console.log('  VideoFiles total:', totalVF);
  console.log('  VF ligados a Content:', vfWithContent);
  console.log('  VF ligados a Episodio:', vfWithEpisode);

  // 2. Análisis de series
  const allSeries = await prisma.content.findMany({
    where: { type: { in: seriesTypes } },
    include: {
      seasons: { include: { episodes: true } },
      translations: { where: { language: 'es' } }
    }
  });

  const noSeason = allSeries.filter(s => s.seasons.length === 0);
  const oneSeason = allSeries.filter(s => s.seasons.length === 1);
  const multiSeason = allSeries.filter(s => s.seasons.length > 1);

  console.log('\nSERIES POR TEMPORADAS:');
  console.log('  Sin ninguna temporada:', noSeason.length);
  console.log('  Con 1 temporada:', oneSeason.length);
  console.log('  Con 2+ temporadas:', multiSeason.length);

  const oneSeasonOneEp = oneSeason.filter(s => s.seasons[0]?.episodes.length === 1);
  console.log('\nSeries con 1 temporada + 1 solo episodio:', oneSeasonOneEp.length);
  oneSeasonOneEp.slice(0, 15).forEach(s => {
    const title = s.translations?.[0]?.title || s.slug;
    console.log(`  [${s.type}] "${title}"`);
  });

  console.log('\nDistribución de series con 1 temporada (agrupadas por #episodios):');
  const dist = {};
  oneSeason.forEach(s => { const c = s.seasons[0]?.episodes.length || 0; dist[c] = (dist[c]||0)+1; });
  Object.entries(dist).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).forEach(([c,q]) => console.log(`  ${c} episodios: ${q} series`));

  console.log('\nSERIES CON 2+ TEMPORADAS (primeras 25):');
  multiSeason.slice(0, 25).forEach(s => {
    const title = s.translations?.[0]?.title || s.slug;
    const info = s.seasons.map(se => `T${se.number}(${se.episodes.length}ep)`).join(', ');
    console.log(`  [${s.type}] "${title}" → ${info}`);
  });

  // 3. Películas con temporadas (error crítico)
  const moviesWithSeasons = await prisma.content.findMany({
    where: { type: 'MOVIE', seasons: { some: {} } },
    include: { seasons: { include: { episodes: true } }, translations: { where: { language: 'es' } } }
  });
  console.log('\nPELÍCULAS CON TEMPORADAS (error grave):', moviesWithSeasons.length);
  moviesWithSeasons.slice(0, 20).forEach(m => {
    const title = m.translations?.[0]?.title || m.slug;
    const info = m.seasons.map(se => `T${se.number}(${se.episodes.length}ep)`).join(', ');
    console.log(`  "${title}" → ${info}`);
  });

  // 4. VF huérfanos
  const orphanVF = await prisma.videoFile.count({ where: { contentId: null, episodeId: null } });
  console.log('\nVideoFiles HUÉRFANOS (sin contentId ni episodeId):', orphanVF);

  // 5. VF tipo EPISODE ligados a películas
  const epVFonMovie = await prisma.videoFile.count({
    where: { type: 'EPISODE', contentId: { not: null } }
  });
  console.log('VideoFiles tipo EPISODE ligados a Content (no a episodio):', epVFonMovie);

  console.log('\n=== FIN DIAGNÓSTICO ===');
  await prisma.$disconnect();
}

diagnose().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
