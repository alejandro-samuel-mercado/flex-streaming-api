import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { addVideoJob } from '../src/services/queue.service';

const prisma = new PrismaClient();
const HLS_PATH = process.env.HLS_PATH || '/home/media/hls';

async function getResolvedRoot(v: any) {
  let resolvedRoot = '';

  // 1. Try hlsPath from DB
  if (v.hlsPath) {
      if (path.isAbsolute(v.hlsPath)) {
          resolvedRoot = v.hlsPath;
      } else if (v.hlsPath.startsWith('media/hls')) {
          resolvedRoot = path.resolve(HLS_PATH, v.hlsPath.replace('media/hls', '').replace(/^\//, ''));
      } else {
          resolvedRoot = path.resolve(process.cwd(), v.hlsPath);
      }
  }

  // 2. Fallback: folder named after the videoFileId
  if (!resolvedRoot || !fs.existsSync(resolvedRoot)) {
      resolvedRoot = path.resolve(HLS_PATH, v.id);
  }

  // 3. Try legacy behavior (contentId or episodeId)
  if (!fs.existsSync(resolvedRoot)) {
      const folderId = v.contentId || v.episodeId;
      if (folderId) resolvedRoot = path.resolve(HLS_PATH, folderId);
  }

  // 4. Last resort: parent content via episode -> season
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
  console.log('🔍 Buscando SÓLO películas/series recientes (últimas 48 hrs) que realmente fueron borradas del disco...');
  
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const completedVideos = await prisma.videoFile.findMany({
    where: { 
      status: 'COMPLETED',
      createdAt: { gte: fortyEightHoursAgo } 
    }
  });

  let requeuedCount = 0;
  for (const v of completedVideos) {
    const resolvedRoot = await getResolvedRoot(v);
    const masterPath = path.resolve(resolvedRoot, 'master.m3u8');
    
    // Solo reencolamos si DE VERDAD no está en ninguno de los 4 posibles directorios de HLS
    if (!fs.existsSync(masterPath)) {
      console.log(`⚠️ HLS perdido para el video ${v.id} (${path.basename(v.originalPath)}). Re-encolando...`);
      
      await prisma.videoFile.update({
        where: { id: v.id },
        data: { status: 'QUEUED' }
      });

      try {
        await addVideoJob({
            videoFileId: v.id,
            contentId: v.contentId || v.episodeId || '',
            type: v.type,
            videoPath: v.originalPath
        });
        requeuedCount++;
      } catch (err: any) {
        console.error(`❌ Error al re-encolar ${v.id}: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Finalizado! Se re-encolaron ${requeuedCount} videos de forma SEGURA.`);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
