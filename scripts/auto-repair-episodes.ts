import { PrismaClient, ContentStatus, ProcessingStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Intenta extraer Temporada y Episodio de una ruta de archivo.
 * Ejemplos soportados:
 * - Friends S01E05.mkv -> S:1, E:5
 * - Friends.1x05.mp4 -> S:1, E:5
 * - Friends - Season 1 Episode 05 -> S:1, E:5
 */
function parseEpisodeInfo(filename: string) {
  const patterns = [
    /[sS](\d+)[eE](\d+)/,           // S01E01
    /(\d+)x(\d+)/,                 // 1x01
    /Season\s*(\d+).*?Episode\s*(\d+)/i, // Season 1 Episode 1
    /T(\d+).*?E(\d+)/i,            // T1 E1
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10)
      };
    }
  }
  return null;
}

async function repair() {
  console.log('🚀 Iniciando escaneo exhaustivo en el VPS...');

  // Diagnostic: List ALL video files to see what's actually there
  const allVideos = await prisma.videoFile.findMany({
    where: {
      originalPath: { contains: 'friends', mode: 'insensitive' }
    }
  });
  
  console.log(`📊 Diagnóstico: Encontrados ${allVideos.length} registros que contienen "friends" en la base de datos.`);
  if (allVideos.length > 0) {
    allVideos.forEach(v => {
        console.log(`   - ID: ${v.id} | Status: ${v.status} | EpisodeId: ${v.episodeId} | Path: ${v.originalPath}`);
    });
  }

  // 1. Buscamos videos completados que no tengan episodio asignado
  const orphans = await prisma.videoFile.findMany({
    where: {
      status: ProcessingStatus.COMPLETED,
      episodeId: null
    },
    include: {
      content: true
    }
  });

  if (orphans.length === 0) {
    console.log('✅ No se encontraron videos huérfanos para procesar.');
    return;
  }

  console.log(`📑 Encontrados ${orphans.length} videos para analizar.`);

  for (const vf of orphans) {
    console.log(`\n🔍 Analizando: "${vf.originalPath}"`);
    
    const info = parseEpisodeInfo(vf.originalPath);
    if (!info) {
      console.log(`   ❌ No se pudo determinar S/E del nombre del archivo.`);
      continue;
    }

    // Buscamos a qué contenido pertenece
    // Si no tiene contentId asignado, intentamos buscarlo por nombre del archivo
    let content = vf.content;
    if (!content) {
      const filename = vf.originalPath.split('/').pop() || '';
      // Intentamos buscar una serie que coincida con la primera palabra del archivo
      const seriesGuess = filename.split(/[ .\-_]/)[0];
      content = await prisma.content.findFirst({
        where: {
          OR: [
            { slug: { contains: seriesGuess, mode: 'insensitive' } },
            { originalTitle: { contains: seriesGuess, mode: 'insensitive' } }
          ],
          type: { not: 'MOVIE' }
        }
      });
    }

    if (!content) {
      console.log(`   ❌ No se pudo identificar la serie a la que pertenece este video.`);
      continue;
    }

    console.log(`   📺 Serie identificada: ${content.slug} (ID: ${content.id})`);
    console.log(`   📌 Temporada ${info.season}, Episodio ${info.episode}`);

    try {
      // 1. Asegurar que la temporada exista
      let season = await prisma.season.findUnique({
        where: {
          contentId_number: {
            contentId: content.id,
            number: info.season
          }
        }
      });

      if (!season) {
        console.log(`   ➕ Creando Temporada ${info.season}...`);
        season = await prisma.season.create({
          data: {
            contentId: content.id,
            number: info.season
          }
        });
      }

      // 2. Asegurar que el episodio exista
      let episode = await prisma.episode.findUnique({
        where: {
          seasonId_number: {
            seasonId: season.id,
            number: info.episode
          }
        }
      });

      if (!episode) {
        console.log(`   ➕ Creando Episodio ${info.episode}...`);
        episode = await prisma.episode.create({
          data: {
            seasonId: season.id,
            number: info.episode
          }
        });
      }

      // 3. Vincular el video al episodio
      await prisma.videoFile.update({
        where: { id: vf.id },
        data: {
          episodeId: episode.id,
          contentId: content.id // Aseguramos que también esté vinculado al contenido padre
        }
      });

      // 4. Marcar contenido como READY
      await prisma.content.update({
        where: { id: content.id },
        data: { status: ContentStatus.READY }
      });

      console.log(`   ✅ ¡Vinculación exitosa!`);

    } catch (err) {
      console.error(`   ❌ Error procesando vinculación:`, err);
    }
  }

  console.log('\n✨ Proceso de reparación finalizado.');
}

repair()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
