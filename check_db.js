require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const queued = await prisma.videoFile.count({ where: { status: 'QUEUED' } });
  const processing = await prisma.videoFile.count({ where: { status: 'PROCESSING' } });
  const completed = await prisma.videoFile.count({ where: { status: 'COMPLETED' } });
  const failed = await prisma.videoFile.count({ where: { status: 'FAILED' } });
  
  console.log(`📊 BD Status Real:
  - En cola: ${queued}
  - Procesando: ${processing}
  - Completados: ${completed}
  - Fallidos: ${failed}`);
}

main().catch(console.error).finally(() => process.exit(0));
