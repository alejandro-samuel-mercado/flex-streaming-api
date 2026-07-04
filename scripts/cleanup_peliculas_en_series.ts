import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log('🧹 Eliminando películas que se escanearon accidentalmente como series...');
    const fakeMovies = await prisma.content.findMany({
        where: { type: 'MOVIE', seasons: { some: {} } },
        select: { id: true, slug: true }
    });

    if (fakeMovies.length === 0) {
        console.log('✅ No se encontraron películas camufladas como series.');
        process.exit(0);
    }

    const ids = fakeMovies.map(m => m.id);
    
    // Eliminando en cascada todo el contenido falso
    await prisma.content.deleteMany({ where: { id: { in: ids } } });
    
    console.log(`✅ Se eliminaron ${ids.length} películas mal importadas:`);
    fakeMovies.forEach(m => console.log(`   - ${m.slug}`));
    console.log('\n⚠️ IMPORTANTE: Saca esas carpetas de /home/media/series y ponlas en /home/media/peliculas para que el escáner correcto las agarre.');
}
run().then(() => process.exit(0));
