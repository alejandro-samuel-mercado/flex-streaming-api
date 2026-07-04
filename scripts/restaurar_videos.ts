import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Iniciando Restauración de Videos Falsamente Fallidos...');

  const result = await prisma.videoFile.updateMany({
    where: { 
      status: 'FAILED',
      errorMessage: { contains: 'HLS no encontrado en disco' }
    },
    data: {
      status: 'COMPLETED',
      errorMessage: null
    }
  });

  console.log(`✅ ¡Restauración exitosa! Se devolvieron a estado COMPLETED: ${result.count} videos.`);
}

run().finally(() => prisma.$disconnect());
