import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const searchTerm = 'Así aprenderás_S01E01';
  console.log(`Buscando VideoFile con ruta original que contenga: "${searchTerm}"`);
  
  const videoFiles = await prisma.videoFile.findMany({
    where: { originalPath: { contains: searchTerm } }
  });
  
  if (videoFiles.length === 0) {
    console.log('No se encontró ningún VideoFile atascado. El escáner debería poder detectarlo normalmente.');
    return;
  }
  
  for (const vf of videoFiles) {
    console.log(`VideoFile encontrado: ${vf.originalPath} (Estado: ${vf.status})`);
    
    // Si está completado, no lo tocamos a menos que el usuario lo pida
    if (vf.status === 'COMPLETED') {
        console.log('Este episodio ya figura como COMPLETED. Si no aparece, puede haber un problema con el registro de Episodio.');
    } else {
        // Forzamos a FAILED para que el escáner lo reintente
        await prisma.videoFile.update({
            where: { id: vf.id },
            data: { status: 'FAILED', errorMessage: 'Reinicio manual por script de reparación' }
        });
        console.log('✅ VideoFile marcado como FAILED. Al correr el escáner nuevamente, lo volverá a procesar.');
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
