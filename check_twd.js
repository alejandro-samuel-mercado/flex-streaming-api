const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const videos = await prisma.videoFile.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      content: { select: { id: true, status: true, translations: { take: 1 } } },
      episode: { include: { season: { include: { content: { select: { id: true, status: true } } } } } }
    }
  });

  console.log('📋 Últimos 20 videos en procesamiento:');
  videos.forEach(v => {
    const name = v.content?.translations[0]?.title || v.episode?.season?.content?.id || 'Desconocido';
    console.log(`- ID: ${v.id} | Status: ${v.status} | Content: ${name} | ContentStatus: ${v.content?.status || v.episode?.season?.content?.status}`);
  });
}

check()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
