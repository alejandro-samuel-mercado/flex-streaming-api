import './src/shared/config/env';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const original = await prisma.content.findFirst({
        where: { slug: 'the-wonderfools-my5l' },
        include: { seasons: { include: { episodes: { include: { videoFiles: true } } } } }
    });

    if (original) {
        console.log(`Original paths in database for: ${original.slug}`);
        for (const s of original.seasons) {
            for (const e of s.episodes) {
                for (const v of e.videoFiles) {
                    console.log(`E${e.number}: "${v.originalPath}"`);
                }
            }
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
