import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('🚀 [Cleanup] Iniciando limpieza de duplicados...');

  // 1. Obtener todos los contenidos (Series y Películas) incluyendo los marcados como borrados
  const allContent = await prisma.content.findMany({
    include: {
      translations: true,
      seasons: {
        include: { episodes: true }
      }
    }
  });

  // 2. Agrupar por TMDB ID o Título
  const groups = new Map<string, any[]>();

  for (const c of allContent) {
    const title = c.translations.find(t => t.language === 'es')?.title || c.originalTitle || 'Untitled';
    const cleanTitle = title.toLowerCase().trim();
    
    // Si no tiene tmdbId, intentamos extraerlo del título (ej: "1668 friends" -> 1668)
    let effectiveTmdbId = c.tmdbId;
    if (!effectiveTmdbId) {
        const match = cleanTitle.match(/^(\d{3,10})\b/); // Busca un número de 3 a 10 dígitos al inicio
        if (match) effectiveTmdbId = match[1];
    }

    const key = effectiveTmdbId ? `tmdb-${effectiveTmdbId}` : `title-${cleanTitle}`;
    
    console.log(`🔍 Procesando: "${title}" | Key: ${key}`);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...c, cleanTitle });
  }

  console.log(`📊 Grupos detectados: ${groups.size}`);
  let totalMerged = 0;

  for (const contents of groups.values()) {
    if (contents.length <= 1) continue;

    const first = contents[0];
    console.log(`\n📦 Grupo: "${first.cleanTitle}" (${contents.length} duplicados)`);

    // Elegir el "bueno": 
    // 1. El que NO esté borrado
    // 2. El que tenga más episodios
    // 3. El más antiguo
    contents.sort((a, b) => {
        if (a.deletedAt === null && b.deletedAt !== null) return -1;
        if (a.deletedAt !== null && b.deletedAt === null) return 1;
        
        const aCount = a.seasons.reduce((acc: number, s: any) => acc + s.episodes.length, 0);
        const bCount = b.seasons.reduce((acc: number, s: any) => acc + s.episodes.length, 0);
        if (aCount !== bCount) return bCount - aCount;
        return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const target = contents[0];
    const duplicates = contents.slice(1);

    console.log(`   ✅ Manteniendo: ${target.slug} (ID: ${target.id})`);

    for (const dup of duplicates) {
        console.log(`   Merging: ${dup.slug} (ID: ${dup.id}) -> ${target.slug}`);

        // Mover Temporadas
        const dupSeasons = await prisma.season.findMany({ where: { contentId: dup.id } });
        for (const s of dupSeasons) {
            // ¿Ya existe esta temporada en el target?
            const targetSeason = await prisma.season.findUnique({
                where: { contentId_number: { contentId: target.id, number: s.number } }
            });

            if (targetSeason) {
                // Mover episodios de la temporada duplicada a la temporada del target
                await prisma.episode.updateMany({
                    where: { seasonId: s.id },
                    data: { seasonId: targetSeason.id }
                });
                // Borrar temporada duplicada (ahora vacía)
                await prisma.season.delete({ where: { id: s.id } });
            } else {
                // Simplemente mover la temporada al target
                await prisma.season.update({
                    where: { id: s.id },
                    data: { contentId: target.id }
                });
            }
        }

        // Mover VideoFiles (para películas o extras que apunten directo al content)
        await prisma.videoFile.updateMany({
            where: { contentId: dup.id },
            data: { contentId: target.id }
        });

        // Mover otras relaciones (Thumbnails, etc)
        await prisma.thumbnail.updateMany({
            where: { contentId: dup.id },
            data: { contentId: target.id }
        }).catch(() => {}); // Ignorar si hay conflicto de unicidad

        // Mover interacciones de usuarios (Favoritos, Mi Lista, Historial)
        await prisma.watchHistory.updateMany({ where: { contentId: dup.id }, data: { contentId: target.id } }).catch(() => {});
        
        // Para Favoritos y Mi Lista, es mejor mover uno a uno o borrar duplicados
        // para evitar errores de clave duplicada si el usuario ya tiene ambos
        const favs = await prisma.favorite.findMany({ where: { contentId: dup.id } });
        for (const f of favs) {
            try {
                await prisma.favorite.upsert({
                    where: { profileId_contentId: { profileId: f.profileId, contentId: target.id } },
                    update: {},
                    create: { profileId: f.profileId, contentId: target.id, createdAt: f.createdAt }
                });
            } catch (e) {}
        }
        await prisma.favorite.deleteMany({ where: { contentId: dup.id } });

        const myList = await prisma.myList.findMany({ where: { contentId: dup.id } });
        for (const m of myList) {
            try {
                await prisma.myList.upsert({
                    where: { profileId_contentId: { profileId: m.profileId, contentId: target.id } },
                    update: {},
                    create: { profileId: m.profileId, contentId: target.id, createdAt: m.createdAt }
                });
            } catch (e) {}
        }
        await prisma.myList.deleteMany({ where: { contentId: dup.id } });

        // Borrar el duplicado
        await prisma.content.delete({ where: { id: dup.id } });
        totalMerged++;
    }
  }

  console.log(`\n✨ Limpieza completada. Se fusionaron ${totalMerged} registros duplicados.`);
}

cleanup()
  .catch(e => {
    console.error('❌ Error en la limpieza:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
