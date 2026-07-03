import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { env } from '../shared/config/env';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando escaneo de videos "Fantasma" (Sobreescritos o borrados)...');
  
  // Buscar todos los videos que figuran como COMPLETADOS
  const videoFiles = await prisma.videoFile.findMany({
    where: { status: 'COMPLETED' },
    include: { episode: true, content: true }
  });

  console.log(`📌 Se encontraron ${videoFiles.length} videos marcados como COMPLETADOS en la base de datos.`);

  let ghostCount = 0;
  const affectedContentIds = new Set<string>();

  for (const video of videoFiles) {
    if (!video.hlsPath) continue;

    // Resolver la ruta física real
    let resolvedRoot = '';
    if (path.isAbsolute(video.hlsPath)) {
      resolvedRoot = video.hlsPath;
    } else if (video.hlsPath.startsWith('media/hls')) {
      resolvedRoot = path.resolve(env.HLS_PATH, video.hlsPath.replace('media/hls', '').replace(/^\//, ''));
    } else {
      resolvedRoot = path.resolve(process.cwd(), video.hlsPath);
    }

    const masterPath = path.join(resolvedRoot, 'master.m3u8');
    const streamPath = path.join(resolvedRoot, 'stream_video.m3u8'); // Fallback viejo

    // Si el archivo maestro NO existe en el disco duro, es un video fantasma
    if (!fs.existsSync(masterPath) && !fs.existsSync(streamPath)) {
      ghostCount++;
      const title = video.episode ? `Episodio ${video.episode.number}` : (video.content?.slug || 'Película');
      console.log(`❌ [FANTASMA DETECTADO] ID: ${video.id} | ${title} | Ruta rota: ${resolvedRoot}`);
      
      // Eliminar el registro falso de la base de datos para que el Panel te permita resubirlo
      await prisma.videoFile.delete({
        where: { id: video.id }
      });

      if (video.contentId) {
        affectedContentIds.add(video.contentId);
      }
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`🧹 Limpieza completada. Se eliminaron ${ghostCount} videos fantasma.`);

  // Actualizar el estado de los contenidos afectados (Películas o Series a PENDING)
  if (affectedContentIds.size > 0) {
    console.log(`🔄 Recalculando estado de ${affectedContentIds.size} contenidos (Series/Películas) afectados...`);
    for (const contentId of Array.from(affectedContentIds)) {
      const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: { thumbnails: true }
      });

      if (content) {
        let validVideosCount = 0;
        
        if (content.type === 'MOVIE') {
          validVideosCount = await prisma.videoFile.count({
            where: { contentId, status: 'COMPLETED' }
          });
        } else {
          validVideosCount = await prisma.episode.count({
            where: {
              season: { contentId },
              videoFiles: { some: { status: 'COMPLETED' } }
            }
          });
        }

        const hasPoster = content.thumbnails.some((t: any) => t.type === 'POSTER');
        const targetStatus = (validVideosCount > 0 && hasPoster) ? 'ACTIVE' : 'PENDING';
        
        await prisma.content.update({
          where: { id: contentId },
          data: { status: targetStatus }
        });
        console.log(`   - ${content.type === 'MOVIE' ? 'Película' : 'Serie'} "${content.slug}" actualizada a: ${targetStatus} (${validVideosCount} videos válidos).`);
      }
    }
  }

  console.log('✅ Todo en orden. Ya puedes revisar tu Panel de Administración.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
