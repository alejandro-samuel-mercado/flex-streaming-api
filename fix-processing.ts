import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando script para cambiar estado de PROCESSING a PENDING...');

  // Actualiza los registros de la tabla Content (Películas, Series, etc.)
  const updatedContents = await prisma.content.updateMany({
    where: {
      status: 'PROCESSING',
    },
    data: {
      status: 'PENDING',
    },
  });

  console.log(`Se actualizaron ${updatedContents.count} registros de Content de PROCESSING a PENDING.`);

  // Actualiza los registros de la tabla VideoFile
  const updatedVideoFiles = await prisma.videoFile.updateMany({
    where: {
      status: 'PROCESSING',
    },
    data: {
      status: 'PENDING',
    },
  });

  console.log(`Se actualizaron ${updatedVideoFiles.count} registros de VideoFile de PROCESSING a PENDING.`);

  console.log('Script completado con éxito.');
}

main()
  .catch((e) => {
    console.error('Error al ejecutar el script:', e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
