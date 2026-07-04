import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TMDBService } from '../src/services/tmdb.service';
import { env } from '../src/shared/config/env';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Iniciando Reparación de Metadata...');

  // Buscar todos los contenidos que podrían estar incompletos
  const contents = await prisma.content.findMany({
    where: { tmdbId: { not: null } },
    include: { genres: true, thumbnails: true, translations: true }
  });

  console.log(`Encontrados ${contents.length} contenidos para revisar.`);
  const baseUrl = env.BACKEND_URL.replace(/\/$/, '');

  let arreglados = 0;

  for (const content of contents) {
    const hasGenres = content.genres.length > 0;
    const hasPoster = content.thumbnails.some(t => t.type === 'POSTER');
    const translation = content.translations.find(t => t.language === 'es');
    const hasDescription = translation && translation.description && translation.description.length > 10;

    if (!hasGenres || !hasPoster || !hasDescription) {
      console.log(`\n⚠️ Reparando: ${translation?.title || content.slug} (TMDB: ${content.tmdbId})`);
      
      try {
        const type = content.type === 'MOVIE' ? 'movie' : 'tv';
        const details = await TMDBService.getFullDetails(parseInt(content.tmdbId!), type);

        // 1. Reparar Géneros
        if (!hasGenres && details.genres && details.genres.length > 0) {
          for (const genreName of details.genres) {
            const slug = genreName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            let dbGenre = await prisma.genre.findFirst({ where: { OR: [{ slug }, { name: genreName }] } });
            if (!dbGenre) {
              try {
                dbGenre = await prisma.genre.create({ data: { name: genreName, slug } });
              } catch {
                dbGenre = await prisma.genre.findFirst({ where: { OR: [{ slug }, { name: genreName }] } });
              }
            }
            if (dbGenre) {
               await prisma.contentGenre.create({ data: { contentId: content.id, genreId: dbGenre.id } }).catch(() => {});
            }
          }
          console.log(`  - Géneros reparados.`);
        }

        // 2. Reparar Portadas
        if (!hasPoster && details.posterPath) {
          const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', content.id);
          if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });
          
          await TMDBService.downloadImage(details.posterPath, path.join(mediaFolder, 'poster.jpg'));
          await prisma.thumbnail.create({ data: { contentId: content.id, type: 'POSTER', url: `${baseUrl}/media/thumbnails/${content.id}/poster.jpg`, width: 500, height: 750 } });
          console.log(`  - Portada reparada.`);
        }

        // 3. Reparar Sinopsis
        if (!hasDescription && details.synopsis) {
          await prisma.contentTranslation.updateMany({
            where: { contentId: content.id, language: 'es' },
            data: { description: details.synopsis }
          });
          console.log(`  - Sinopsis reparada.`);
        }

        arreglados++;
      } catch (err: any) {
        console.log(`  ❌ Falló al reparar de TMDB: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ Reparación terminada. Se arregló la metadata de ${arreglados} títulos.`);
}

run().finally(() => prisma.$disconnect());
