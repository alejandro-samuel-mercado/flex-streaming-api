import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { addVideoJob } from '../src/shared/queues/video.queue';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Paso 1: Limpiando videos encolados por duplicado...');

  const videoFiles = await prisma.videoFile.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const grouped = new Map<string, typeof videoFiles>();
  for (const v of videoFiles) {
    if (!v.originalPath) continue;
    if (!grouped.has(v.originalPath)) grouped.set(v.originalPath, []);
    grouped.get(v.originalPath)!.push(v);
  }

  let deletedCount = 0;
  for (const [originalPath, group] of grouped.entries()) {
    if (group.length > 1) {
      // Priorizar el que esté completado. Si no hay, tomamos el más antiguo.
      group.sort((a, b) => {
        if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
        if (b.status === 'COMPLETED' && a.status !== 'COMPLETED') return 1;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const [keep, ...duplicates] = group;

      for (const dup of duplicates) {
        await prisma.videoFile.delete({ where: { id: dup.id } });
        console.log(`✅ Duplicado ${dup.id} (${dup.status}) de "${path.basename(originalPath)}" eliminado.`);
        deletedCount++;
      }
    }
  }

  console.log(`\n🔍 Paso 2: Reparando videos "COMPLETADOS" con archivos borrados (Errores 404)...`);
  
  const completedVideos = await prisma.videoFile.findMany({
    where: { status: 'COMPLETED' }
  });

  let requeuedCount = 0;
  for (const v of completedVideos) {
    let resolvedRoot = '';
    
    if (v.hlsPath) {
      if (path.isAbsolute(v.hlsPath)) {
          resolvedRoot = v.hlsPath;
      } else if (v.hlsPath.startsWith('media/hls')) {
          resolvedRoot = path.resolve(process.env.HLS_PATH || '/home/media/hls', v.hlsPath.replace('media/hls', '').replace(/^\//, ''));
      } else {
          resolvedRoot = path.resolve(process.cwd(), v.hlsPath);
      }
    } else {
      resolvedRoot = path.resolve(process.env.HLS_PATH || '/home/media/hls', v.id);
    }

    const masterPath = path.resolve(resolvedRoot, 'master.m3u8');
    
    // Si la carpeta HLS o el master.m3u8 no existe, significa que otro worker lo borró por error.
    if (!fs.existsSync(masterPath)) {
      console.log(`⚠️ Archivos HLS no encontrados para "${path.basename(v.originalPath || '')}" en ${resolvedRoot}. Re-encolando para procesar de nuevo...`);
      
      await prisma.videoFile.update({
        where: { id: v.id },
        data: { status: 'QUEUED' }
      });

      try {
        await addVideoJob({
            videoFileId: v.id,
            contentId: v.contentId || v.episodeId || '',
            type: v.type,
            videoPath: v.originalPath || ''
        });
        requeuedCount++;
      } catch (err: any) {
        console.error(`❌ Error al re-encolar ${v.id}: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Finalizado! Se eliminaron ${deletedCount} duplicados y se re-encolaron ${requeuedCount} videos dañados.`);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
