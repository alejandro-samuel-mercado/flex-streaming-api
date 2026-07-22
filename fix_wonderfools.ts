import './src/shared/config/env';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // 1. Encontrar la serie duplicada "The WONDERfools" (la que no debe estar)
    const duplicate = await prisma.content.findFirst({
        where: { title: 'The WONDERfools', type: 'SERIES' },
        include: { seasons: { include: { episodes: { include: { videoFiles: true } } } } }
    });

    if (duplicate) {
        console.log(`Borrando serie duplicada: ${duplicate.title}`);
        for (const s of duplicate.seasons) {
            for (const e of s.episodes) {
                // Borrar los video files duplicados que estaban en cola
                for (const v of e.videoFiles) {
                    await prisma.videoFile.delete({ where: { id: v.id } });
                }
                await prisma.episode.delete({ where: { id: e.id } });
            }
            await prisma.season.delete({ where: { id: s.id } });
        }
        await prisma.content.delete({ where: { id: duplicate.id } });
        console.log('✅ Serie duplicada eliminada completamente de la base de datos.');
    } else {
        console.log('No se encontró la serie duplicada "The WONDERfools".');
    }

    // 2. Encontrar la serie original "Los SUPERfrikis"
    const original = await prisma.content.findFirst({
        where: { slug: 'the-wonderfools-my5l' },
        include: { seasons: { include: { episodes: { include: { videoFiles: true } } } } }
    });

    if (original) {
        let failedCount = 0;
        for (const s of original.seasons) {
            for (const e of s.episodes) {
                for (const v of e.videoFiles) {
                    if (v.status === 'FAILED') {
                        failedCount++;
                    }
                }
            }
        }
        console.log(`La serie original "Los SUPERfrikis" tiene ${failedCount} episodios marcados como FAILED.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
