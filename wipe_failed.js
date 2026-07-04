require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.videoFile.deleteMany({
    where: { status: 'FAILED' }
  });
  console.log('Borrados FAILED:', deleted.count);
  
  const deletedPending = await prisma.videoFile.deleteMany({
    where: { status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } }
  });
  console.log('Borrados atascados:', deletedPending.count);
}
main().finally(() => prisma.$disconnect());
