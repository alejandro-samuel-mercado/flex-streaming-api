import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/shared/config/prisma';

async function fixMess() {
  console.log('Buscando archivos de video COMPLETED que no tienen fragmentos .ts...');
  
  const videoFiles = await prisma.videoFile.findMany({
    where: {
      status: 'COMPLETED',
      hlsPath: {
        not: ''
      }
    }
  });

  let fixedCount = 0;

  for (const vf of videoFiles) {
    if (!vf.hlsPath) continue;

    try {
      if (fs.existsSync(vf.hlsPath)) {
        const files = fs.readdirSync(vf.hlsPath);
        const hasTs = files.some(f => f.endsWith('.ts'));

        if (!hasTs) {
          console.log(`[Roto] ${vf.id} - ${vf.originalPath} (Carpeta: ${vf.hlsPath}) no tiene .ts. Marcando como FAILED...`);
          
          // Borramos la carpeta HLS vacía/rota para limpiar (tiene los m3u8 rotos)
          try {
            fs.rmSync(vf.hlsPath, { recursive: true, force: true });
          } catch (e) {}

          await prisma.videoFile.update({
            where: { id: vf.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Carpeta HLS generada sin fragmentos .ts debido a bug previo de FFmpeg. Se reprocesará automáticamente.',
              masterPlaylist: '',
              hlsPath: ''
            }
          });
          fixedCount++;
        }
      } else {
         // La carpeta ni siquiera existe
          console.log(`[Roto] ${vf.id} - ${vf.originalPath} - Carpeta HLS no existe. Marcando como FAILED...`);
          await prisma.videoFile.update({
            where: { id: vf.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Carpeta HLS no encontrada.',
              masterPlaylist: '',
              hlsPath: ''
            }
          });
          fixedCount++;
      }
    } catch (e: any) {
      console.error(`Error procesando videoFile ${vf.id}:`, e.message);
    }
  }

  console.log(`\n¡Listo! Se encontraron y marcaron como fallidos ${fixedCount} videos rotos.`);
  console.log(`Para que se reprocesen solos, simplemente ejecuta el cron o espera a que el escáner pase de nuevo.`);
}

fixMess()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
