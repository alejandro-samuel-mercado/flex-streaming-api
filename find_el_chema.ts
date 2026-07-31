import { prisma } from './src/shared/config/prisma';

async function main() {
    // Buscar contenidos recientes de tipo serie
    const series = await prisma.content.findMany({
        where: { type: 'SERIES' },
        include: { translations: true },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    console.log("📺 Últimas 10 series registradas en la base de datos:");
    series.forEach(s => {
        const title = s.translations?.[0]?.title || 'Sin Título';
        console.log(`\n- Título: ${title}`);
        console.log(`  ID (para buscar en el panel): ${s.id}`);
        console.log(`  TMDB ID: ${s.tmdbId}`);
        console.log(`  Status: ${s.status}`);
    });
}
main().catch(console.error).finally(() => process.exit(0));
