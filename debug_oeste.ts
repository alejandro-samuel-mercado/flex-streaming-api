import './src/shared/config/env';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("=== Buscando serie Erase una vez el Oeste ===");
    const series = await prisma.content.findMany({
        where: {
            translations: { some: { title: { contains: 'oeste', mode: 'insensitive' } } },
            type: 'SERIES'
        },
        include: { translations: true, seasons: { include: { episodes: { include: { videoFiles: true } } } } }
    });

    for (const c of series) {
        console.log(`Serie: ${c.translations[0]?.title} (ID: ${c.id})`);
        for (const s of c.seasons) {
            for (const e of s.episodes) {
                console.log(`  E${e.number}: ${e.videoFiles.length} videos`);
                for (const v of e.videoFiles) {
                    console.log(`    - [${v.status}] ${v.originalPath}`);
                }
            }
        }
    }

    console.log("\n=== Buscando Rechazos ===");
    const rejected = await prisma.rejectedImport.findMany({
        where: { filePath: { contains: 'Oeste' } }
    });
    for (const r of rejected) {
        console.log(`Rechazado: ${r.fileName} -> Razón: ${r.reason}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
