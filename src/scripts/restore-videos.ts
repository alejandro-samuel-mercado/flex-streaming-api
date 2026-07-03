import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { env } from '../shared/config/env';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando escaneo del disco duro local para RESTAURAR videos en la base de datos...');
  
  const hlsRoot = path.join(env.MEDIA_PATH, 'hls');
  if (!fs.existsSync(hlsRoot)) {
    console.error(`❌ La ruta ${hlsRoot} no existe en este servidor.`);
    process.exit(1);
  }

  const folders = fs.readdirSync(hlsRoot);
  console.log(`📌 Se encontraron ${folders.length} carpetas HLS físicas en el disco duro.`);

  let restoredMovies = 0;
  let restoredEpisodes = 0;

  for (const folder of folders) {
    const folderPath = path.join(hlsRoot, folder);
    
    // Solo procesar directorios reales
    if (!fs.statSync(folderPath).isDirectory()) continue;

    // Verificar si la carpeta tiene archivos de video
    const hasMaster = fs.existsSync(path.join(folderPath, 'master.m3u8'));
    const hasStream = fs.existsSync(path.join(folderPath, 'stream_video.m3u8'));
    if (!hasMaster && !hasStream) continue;

    // Buscar la película o serie a la que le pertenece esta carpeta
    const content = await prisma.content.findUnique({
      where: { id: folder },
      include: { seasons: { include: { episodes: true } } }
    });

    if (content) {
      if (content.type === 'MOVIE') {
        // Restaurar película
        const existing = await prisma.videoFile.findFirst({
          where: { contentId: content.id, type: 'MOVIE', status: 'COMPLETED' }
        });
        if (!existing) {
          await prisma.videoFile.create({
            data: {
              contentId: content.id,
              type: 'MOVIE',
              status: 'COMPLETED',
              originalPath: 'RESTORED_BY_SCRIPT',
              hlsPath: folderPath,
              quality: '1080p'
            }
          });
          await prisma.content.update({ where: { id: content.id }, data: { status: 'ACTIVE' } });
          restoredMovies++;
          console.log(`✅ Película restaurada: ${content.title || content.slug}`);
        }
      } else {
        // Restaurar serie: vinculamos el video a TODOS sus episodios para replicar el estado exacto anterior
        for (const season of content.seasons) {
          for (const ep of season.episodes) {
            const existing = await prisma.videoFile.findFirst({
              where: { episodeId: ep.id, status: 'COMPLETED' }
            });
            if (!existing) {
              await prisma.videoFile.create({
                data: {
                  contentId: content.id,
                  episodeId: ep.id,
                  type: 'EPISODE',
                  status: 'COMPLETED',
                  originalPath: 'RESTORED_BY_SCRIPT',
                  hlsPath: folderPath,
                  quality: '1080p'
                }
              });
              restoredEpisodes++;
            }
          }
        }
        await prisma.content.update({ where: { id: content.id }, data: { status: 'ACTIVE' } });
        console.log(`✅ Serie restaurada: ${content.title || content.slug}`);
      }
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`🎉 Restauración completada en ESTE servidor.`);
  console.log(`🎬 Películas restauradas con éxito: ${restoredMovies}`);
  console.log(`📺 Episodios restaurados con éxito: ${restoredEpisodes}`);
  console.log('--------------------------------------------------');
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
