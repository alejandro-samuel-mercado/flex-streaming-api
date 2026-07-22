import './src/shared/config/env';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const titles = ['rural', 'persia', 'dragón', 'dragon'];
    
    console.log("=== Buscando series problemáticas ===");
    for (const t of titles) {
        const series = await prisma.content.findMany({
            where: {
                translations: { some: { title: { contains: t, mode: 'insensitive' } } },
                type: 'SERIES'
            },
            include: { translations: true, seasons: { include: { episodes: { include: { videoFiles: true } } } } }
        });

        for (const c of series) {
            console.log(`\nSerie: ${c.translations[0]?.title} (ID: ${c.id})`);
            for (const s of c.seasons) {
                for (const e of s.episodes) {
                    console.log(`  E${e.number}: ${e.videoFiles.length} videos`);
                    for (const v of e.videoFiles) {
                        console.log(`    - [${v.status}] ${v.originalPath}`);
                    }
                }
            }
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
