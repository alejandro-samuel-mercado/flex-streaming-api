import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const series = await prisma.content.findFirst({
        where: { slug: 'the-wonderfools-my5l' },
        include: {
            seasons: {
                include: {
                    episodes: {
                        include: {
                            videoFiles: true
                        }
                    }
                }
            }
        }
    });

    if (!series) {
        console.log('Series not found.');
        return;
    }

    console.log(`Series: ${series.title}`);
    for (const s of series.seasons) {
        console.log(` Season ${s.number}`);
        for (const e of s.episodes) {
            console.log(`  Episode ${e.number}: ${e.videoFiles.length} video files`);
            for (const v of e.videoFiles) {
                console.log(`   - VF ID: ${v.id}, Status: ${v.status}, OrigPath: ${v.originalPath}, type: ${v.type}`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
