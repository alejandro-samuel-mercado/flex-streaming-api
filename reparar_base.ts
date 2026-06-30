import { prisma } from './src/shared/config/prisma';

async function main() {
    console.log("Buscando contenido eliminado (en papelera) o huérfano...");
    
    // Buscar contenidos que fueron "eliminados" lógicamente
    const deleted = await prisma.content.findMany({
        where: { deletedAt: { not: null } }
    });
    
    console.log(`Encontrados ${deleted.length} contenidos en la papelera.`);
    
    for (const item of deleted) {
        console.log(`Borrando definitivamente: ${item.slug}`);
        await prisma.content.delete({ where: { id: item.id } });
    }

    const orphans = await prisma.videoFile.deleteMany({
        where: { contentId: null, episodeId: null }
    });
    console.log(`Borrados ${orphans.count} videos huérfanos sin contenido asignado.`);
    
    console.log("✅ Limpieza terminada. ¡Vuelve a ejecutar npx tsx escanear_series.ts!");
}

main().finally(() => prisma.$disconnect());
