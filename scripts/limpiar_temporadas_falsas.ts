import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando videos de episodios que en realidad son carpetas de Temporada enteras...');

  const episodes = await prisma.videoFile.findMany({
    where: { type: 'EPISODE' }
  });

  let eliminados = 0;

  for (const vf of episodes) {
    if (!vf.originalPath) continue;

    // Si el path original termina en algo genérico como "Temporada 1" o "Season 1"
    const isSeasonFolder = /[Tt]emp(?:orada)?\s*\d+/i.test(path.basename(vf.originalPath)) || 
                           /[Ss]eason\s*\d+/i.test(path.basename(vf.originalPath));
                           
    let esFalso = isSeasonFolder;
    
    // Verificamos si realmente tiene el index.m3u8 DIRECTO adentro
    if (!esFalso) {
        const m3u8Path = path.join(vf.originalPath, 'index.m3u8');
        const videoM3u8Path = path.join(vf.originalPath, 'video.m3u8');
        const masterM3u8Path = path.join(vf.originalPath, 'master.m3u8');
        
        if (!fs.existsSync(m3u8Path) && !fs.existsSync(videoM3u8Path) && !fs.existsSync(masterM3u8Path)) {
            // No tiene m3u8 directo, significa que es una carpeta padre (falsa)
            esFalso = true;
        }
    }

    if (esFalso) {
      console.log(`⚠️ Destruyendo registro falso de temporada: ${vf.originalPath}`);
      await prisma.videoQuality.deleteMany({ where: { videoFileId: vf.id } });
      await prisma.videoFile.delete({ where: { id: vf.id } });
      eliminados++;
    }
  }

  console.log(`\n✅ ¡Limpieza de temporadas falsas completada!`);
  console.log(`- Se eliminaron ${eliminados} registros falsos.`);
  console.log('➡️ AHORA SÍ, corre "npx tsx escanear_series.ts" en tu servidor de series.');
}

run().finally(() => process.exit(0));
