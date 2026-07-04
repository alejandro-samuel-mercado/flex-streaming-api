require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ids = ['cmqso9hz6007o10smzl7du57c', 'cmqso9i57007q10smw7k4g228', 'cmqso9lsi008610sm47ur57yx', 'cmqso9lsj008810sm3rgoidri', 'cmqso9lyi008a10smy4lr7iyn'];
  
  const episodes = await prisma.episode.findMany({
    where: { id: { in: ids } }
  });
  
  console.log('Episodios encontrados:', episodes.length);
  episodes.forEach(e => console.log('  - Episodio', e.id));
}

main().catch(console.error).finally(() => process.exit(0));
