require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Eliminando registros fantasma de la BD...');
  const result = await prisma.videoFile.deleteMany({
    where: { status: { in: ['QUEUED', 'PROCESSING'] }, type: 'MOVIE' }
  });
  console.log(`✅ Eliminados ${result.count} registros que estaban atascados en QUEUED pero no estaban en Redis.`);
}

main().catch(console.error).finally(() => process.exit(0));
