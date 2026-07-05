import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const HLS_PATH = process.env.HLS_PATH || '/home/media/hls';

async function getResolvedRoot(v: any) {
  let resolvedRoot = '';

  if (v.hlsPath) {
      if (path.isAbsolute(v.hlsPath)) {
          resolvedRoot = v.hlsPath;
      } else if (v.hlsPath.startsWith('media/hls')) {
          resolvedRoot = path.resolve(HLS_PATH, v.hlsPath.replace('media/hls', '').replace(/^\//, ''));
      } else {
          resolvedRoot = path.resolve(process.cwd(), v.hlsPath);
      }
  }

  if (!resolvedRoot || !fs.existsSync(resolvedRoot)) {
      resolvedRoot = path.resolve(HLS_PATH, v.id);
  }

  if (!fs.existsSync(resolvedRoot)) {
      const folderId = v.contentId || v.episodeId;
      if (folderId) resolvedRoot = path.resolve(HLS_PATH, folderId);
  }

  if (!fs.existsSync(resolvedRoot) && v.episodeId) {
      const ep = await prisma.episode.findUnique({
          where: { id: v.episodeId },
          include: { season: { select: { contentId: true } } }
      });
      if (ep?.season?.contentId) {
          resolvedRoot = path.resolve(HLS_PATH, ep.season.contentId);
      }
  }
  
  return resolvedRoot;
}

async function run() {
  const type = process.argv[2];
  if (type !== '--movies' && type !== '--series') {
    console.error("❌ ERROR: Debes especificar '--movies' o '--series'");
    process.exit(1);
  }

  const videoType = type === '--movies' ? 'MOVIE' : 'SERIES';
  console.log(`🔍 Buscando ${videoType}s que figuran como "Completados" pero sus archivos reales NO existen...`);

  // Buscamos TODOS los videos completados
  const completedVideos = await prisma.videoFile.findMany({
    where: { 
      status: 'COMPLETED',
      type: videoType
    }
  });

  let deletedCount = 0;
  for (const v of completedVideos) {
    const resolvedRoot = await getResolvedRoot(v);
    
    // Verificamos si existe el archivo de video real (no solo el playlist)
    const firstSegmentPath = path.resolve(resolvedRoot, 'stream_video_000.ts');
    
    // Si el primer segmento de video no existe, entonces el video está roto (404)
    if (!fs.existsSync(firstSegmentPath)) {
      console.log(`🗑️ BORRANDO: Video roto detectado en panel para ID ${v.id} (${path.basename(v.originalPath)})`);
      
      // Lo eliminamos por completo de la base de datos
      await prisma.videoFile.delete({
        where: { id: v.id }
      });

      deletedCount++;
    }
  }

  console.log(`\n🎉 Limpieza finalizada! Se borraron ${deletedCount} videos rotos del panel.`);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
