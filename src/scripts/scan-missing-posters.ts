import { prisma } from '../shared/config/prisma';
import { TMDBService } from '../services/tmdb.service';
import { env } from '../shared/config/env';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('🚀 Iniciando escaneo de portadas (POSTER) faltantes...');
  console.log('------------------------------------------------------------------------');

  // Buscamos TODOS los contenidos para verificar tanto en DB como en disco físico
  const allContents = await prisma.content.findMany({
    include: {
      thumbnails: true,
      translations: { where: { language: 'es' }, take: 1 }
    }
  });

  // Filtramos los que realmente no tienen portada (ya sea en DB o en disco)
  const contents = allContents.filter(item => {
    const poster = item.thumbnails.find(t => t.type === 'POSTER');
    
    // Si no está en DB o no tiene URL
    if (!poster || !poster.url) return true;

    // Si es una ruta local, verificamos que el archivo físico exista
    if (poster.url.startsWith('/media/')) {
      const fileName = poster.url.split('/').pop() || 'poster.jpg';
      const physicalPath = path.join(env.MEDIA_PATH, 'thumbnails', item.id, fileName);
      if (!fs.existsSync(physicalPath)) {
        return true; // Falta en el disco
      }
    }

    return false;
  });

  const total = contents.length;
  console.log(`📌 Encontrados ${total} contenidos sin portada (POSTER).`);

  if (total === 0) {
    console.log('✅ Todos los contenidos tienen portada. No hay nada que hacer.');
    return;
  }

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < total; i++) {
    const item = contents[i];
    const title = item.translations?.[0]?.title || item.slug || item.originalTitle || 'Sin título';
    const percent = Math.round(((i + 1) / total) * 100);

    console.log(`\n[${percent}%] (${i + 1}/${total}) Procesando: "${title}"...`);

    try {
      let tmdbId = item.tmdbId;
      const mediaType = item.type === 'MOVIE' ? 'movie' : 'tv';

      // Si no tiene tmdbId, intentamos buscarlo en TMDB para poder obtener la portada
      if (!tmdbId) {
        console.log(`   🔍 No tiene TMDB ID, buscando en TMDB por título...`);
        const searchRes = await TMDBService.searchWithFallback(title, 'es-ES', mediaType);
        if (searchRes.bestMatch && searchRes.bestMatch.id) {
          tmdbId = String(searchRes.bestMatch.id);
          console.log(`   ✅ TMDB ID encontrado: ${tmdbId} (Confianza: ${Math.round(searchRes.confidence * 100)}%)`);
          await prisma.content.update({
            where: { id: item.id },
            data: { tmdbId }
          });
        } else {
          console.log(`   ⚠️ No se encontró en TMDB usando el título.`);
          notFoundCount++;
          continue;
        }
      }

      // Obtenemos los detalles de TMDB
      const details = await TMDBService.getFullDetails(tmdbId, mediaType);

      const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', item.id);
      if (!fs.existsSync(mediaFolder)) {
        fs.mkdirSync(mediaFolder, { recursive: true });
      }

      // Descargar Póster
      if (details.posterPath) {
        const localPosterPath = path.join(mediaFolder, 'poster.jpg');
        console.log(`   ⬇️  Descargando póster oficial: ${details.posterPath}...`);
        await TMDBService.downloadImage(details.posterPath, localPosterPath);

        const posterUrl = `/media/thumbnails/${item.id}/poster.jpg`;
        await prisma.thumbnail.upsert({
          where: {
            contentId_type: { contentId: item.id, type: 'POSTER' }
          },
          update: { url: posterUrl, width: 500, height: 750 },
          create: { contentId: item.id, type: 'POSTER', url: posterUrl, width: 500, height: 750 }
        });
        console.log(`   ✅ Póster guardado exitosamente.`);
      } else {
        console.log(`   ⚠️ TMDB no tiene póster para este contenido.`);
      }

      // Opcionalmente, descargar el Backdrop también (si "el otro" se refería al fondo)
      if (details.backdropPath) {
        const localBackdropPath = path.join(mediaFolder, 'backdrop.jpg');
        console.log(`   ⬇️  Descargando backdrop oficial: ${details.backdropPath}...`);
        await TMDBService.downloadImage(details.backdropPath, localBackdropPath);

        const backdropUrl = `/media/thumbnails/${item.id}/backdrop.jpg`;
        await prisma.thumbnail.upsert({
          where: {
            contentId_type: { contentId: item.id, type: 'BACKDROP' }
          },
          update: { url: backdropUrl, width: 1920, height: 1080 },
          create: { contentId: item.id, type: 'BACKDROP', url: backdropUrl, width: 1920, height: 1080 }
        });
        console.log(`   ✅ Banner (backdrop) guardado exitosamente.`);
      }

      successCount++;
      // Polite rate limit delay
      await new Promise((resolve) => setTimeout(resolve, 200));

    } catch (err: any) {
      errorCount++;
      console.error(`   ❌ Error procesando "${title}":`, err.message);
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('🎉 ¡Proceso de portadas completado!');
  console.log(`📊 Resumen:`);
  console.log(`   - Exitosos (descargados): ${successCount}`);
  console.log(`   - No encontrados en TMDB: ${notFoundCount}`);
  console.log(`   - Con Errores: ${errorCount}`);
  console.log(`   - Total Procesados: ${total}`);
  console.log('------------------------------------------------------------------------');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('💥 Error crítico en el script:', e);
    await prisma.$disconnect();
    throw e;
  });
