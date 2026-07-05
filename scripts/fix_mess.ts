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
          
          try {
            fs.rmSync(vf.hlsPath, { recursive: true, force: true });
          } catch (e) {}

          await prisma.videoFile.update({
            where: { id: vf.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Carpeta HLS generada sin fragmentos .ts debido a bug previo. Se reprocesará.',
              masterPlaylist: '',
              hlsPath: ''
            }
          });
          fixedCount++;
        } else {
          // La carpeta existe y tiene .ts, está perfecta.
        }
      } else {
         // CRÍTICO: Si la carpeta no existe, NO hacemos nada. 
         // Como cada VPS (Películas y Series) tiene su propio disco local /home/peliplus_gran_disco,
         // no podemos asumir que está roto, simplemente está en el OTRO servidor.
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
