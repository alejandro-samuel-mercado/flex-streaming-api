import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';

// Asegurarse de cargar las variables de entorno para que prisma se pueda conectar a la BD
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Buscando series "fantasma" (sin TMDB ID, creadas por error de parseo)...');
  
  const series = await prisma.content.findMany({
    where: { 
      type: 'SERIES',
      tmdbId: null 
    },
    include: { translations: true }
  });

  let count = 0;
  for (const s of series) {
     const title = s.translations[0]?.title || '';
     
     // Detectar si el título de esta serie vacía fue el nombre bruto de la carpeta
     // ej: "60735 the flash", "456 los simpson"
     if (/^\d+[\s_-]/.test(title) || /^\d+$/.test(title) || title.includes('Sin título')) {
        console.log(`🗑️  Borrando serie fantasma: "${title}" (ID: ${s.id})`);
        
        // Prisma cascadeará y borrará cualquier 'Season' o 'Episode' huérfano asociado a esta serie
        // así como los 'VideoFile' que estuvieran en estado FAILED atados a ella.
        await prisma.content.delete({ 
          where: { id: s.id } 
        });
        
        count++;
     }
  }

  if (count > 0) {
    console.log(`✅ ¡Limpieza completada! Se eliminaron ${count} series fantasma.`);
    console.log(`Las siguientes veces que el Cron escanee, los archivos reales se asignarán a la serie correcta.`);
  } else {
    console.log(`👍 No se encontraron series fantasma que limpiar.`);
  }
}

main()
  .catch((e) => {
    console.error('Error durante la limpieza:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
