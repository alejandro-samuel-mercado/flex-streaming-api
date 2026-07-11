import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const searchTerm = 'Así aprenderás_S01E01';
  console.log('--- DIAGNÓSTICO DE EPISODIO 1 ---');
  
  const videoFile = await prisma.videoFile.findFirst({
    where: { originalPath: { contains: searchTerm } },
    include: {
        episode: {
            include: {
                season: {
                    include: {
                        content: {
                            include: { translations: true }
                        }
                    }
                }
            }
        }
    }
  });
  
  if (!videoFile) {
    console.log('No se encontró el VideoFile.');
    return;
  }
  
  console.log(`VideoFile ID: ${videoFile.id}`);
  console.log(`Estado: ${videoFile.status}`);
  console.log(`Ruta: ${videoFile.originalPath}`);
  
  if (!videoFile.episode) {
      console.log('⚠️ ALERTA: El VideoFile no tiene un Episodio asignado (episodeId es null o el registro se borró).');
  } else {
      const ep = videoFile.episode;
      console.log(`Episodio ID: ${ep.id} | Número: ${ep.number}`);
      
      if (!ep.season) {
          console.log('⚠️ ALERTA: El Episodio no tiene una Temporada (seasonId es null).');
      } else {
          const season = ep.season;
          console.log(`Temporada ID: ${season.id} | Número: ${season.number}`);
          
          if (!season.content) {
              console.log('⚠️ ALERTA: La Temporada no tiene Serie asignada (Content).');
          } else {
              const content = season.content;
              const title = content.translations[0]?.title || content.slug;
              console.log(`Serie ID: ${content.id} | Título: ${title} | TMDB: ${content.tmdbId}`);
              
              // Buscar todos los episodios de esta serie para ver si están juntos
              const allEps = await prisma.episode.count({ where: { season: { contentId: content.id } } });
              console.log(`Total de episodios asociados a esta serie en DB: ${allEps}`);
          }
      }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
