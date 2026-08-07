import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function findZombies() {
  const contents = await prisma.content.findMany({
    where: { 
      type: 'MOVIE',
      deletedAt: null // Solo las que están visibles
    },
    include: { videoFiles: true }
  });
  
  const zombies = contents.filter(c => c.videoFiles.length === 0);
  
  console.log(`\n🧟 ENCONTRADAS ${zombies.length} PELÍCULAS "ZOMBIES" (Sin archivo de video)\n`);
  
  if (zombies.length === 0) {
      console.log("¡Todo está perfecto! No hay zombies en tu base de datos.");
      process.exit(0);
  }
  
  console.log("Puedes ir a tu panel web y ELIMINAR estas películas con seguridad:\n");
  
  for(const c of zombies) {
    console.log(`🎬 Título: ${c.title || 'Desconocido'}`);
    console.log(`   ID Panel: ${c.id}`);
    console.log(`   Estado: ${c.status}`);
    console.log('----------------------------------------------------');
  }
}

findZombies().finally(() => process.exit(0));
