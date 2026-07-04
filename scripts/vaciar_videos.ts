import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

function pregunta(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin as any, output: process.stdout as any });
  return new Promise(resolve => rl.question(prompt, (ans: string) => { rl.close(); resolve(ans); }));
}

async function vaciarVideos() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   VACIAR VIDEOS (MANTENIENDO CATÁLOGO)               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('⚠️  ATENCIÓN: Esto borrará TODOS los episodios, temporadas y archivos de video.');
  console.log('   Los títulos (Películas y Series) SE CONSERVARÁN, pero quedarán VACÍOS (PENDING).');
  console.log('');

  const confirm = await pregunta("¿Confirmar borrado? (escribe 'VACIAR' para continuar): ");
  if (confirm !== 'VACIAR') {
    console.log('Cancelado.');
    process.exit(0);
  }

  console.log('');
  console.log('🗑️  Borrando videos, audios y subtítulos...');

  // Borrar historial (depende de video/episodio)
  await prisma.watchHistory.deleteMany({});
  await prisma.watchSession.deleteMany({});

  // Borrar archivos multimedia
  await prisma.subtitleTrack.deleteMany({});
  await prisma.audioTrack.deleteMany({});
  await prisma.videoQuality.deleteMany({});
  
  // Borrar los archivos de video en sí
  await prisma.videoFile.deleteMany({});

  // Borrar episodios y temporadas (las series quedarán vacías)
  await prisma.episodeTranslation.deleteMany({});
  await prisma.episode.deleteMany({});
  await prisma.seasonTranslation.deleteMany({});
  await prisma.season.deleteMany({});

  // Poner todo el contenido (series y películas) en PENDING ya que no tienen video
  const result = await prisma.content.updateMany({
    data: { status: 'PENDING' }
  });

  console.log('');
  console.log('✅ Base de datos vaciada.');
  console.log(`   Se mantuvieron los títulos, pero ${result.count} películas/series pasaron a estado PENDING.`);
  console.log('   (Ya no tienen videos ni episodios asignados).');
  console.log('');
}

vaciarVideos()
  .catch(err => { console.error('❌ Error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
