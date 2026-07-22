import './src/shared/config/env';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const titles = ['rural', 'persia', 'dragón', 'dragon'];
    
    for (const t of titles) {
        const series = await prisma.content.findMany({
            where: {
                translations: { some: { title: { contains: t, mode: 'insensitive' } } },
                type: 'SERIES'
            },
            include: { translations: true }
        });
        console.log(`\nFound ${series.length} series matching '${t}'`);
        for (const c of series) {
            console.log(`  - ${c.translations[0]?.title} | Slug: ${c.slug} | ID: ${c.id} | Status: ${c.status}`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
