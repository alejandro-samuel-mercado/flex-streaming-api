import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function run() {
    console.log("🔍 Buscando contenidos duplicados...");

    // Traer todos los contenidos con sus traducciones
    const contents = await prisma.content.findMany({
        where: { deletedAt: null, type: 'MOVIE' },
        include: { translations: true, videoFiles: true }
    });

    // Agrupar por título
    const titleGroups: Record<string, typeof contents> = {};
    for (const c of contents) {
        const title = c.translations[0]?.title?.trim().toLowerCase();
        if (!title) continue;
        if (!titleGroups[title]) titleGroups[title] = [];
        titleGroups[title].push(c);
    }

    let deletedCount = 0;

    for (const [title, group] of Object.entries(titleGroups)) {
        if (group.length > 1) {
            console.log(`\n⚠️ Encontrados ${group.length} registros para: "${title}"`);
            
            // Ordenar por fecha de creación (el más antiguo primero)
            group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            const duplicates = group.slice(1); // Todos menos el original (el más viejo)

            for (const dup of duplicates) {
                if (dup.status === 'PENDING') {
                    console.log(` 🗑️  Borrando duplicado PENDIENTE: ${dup.slug} (ID: ${dup.id})`);
                    
                    // Soft-delete al Content para que desaparezca del panel
                    await prisma.content.update({
                        where: { id: dup.id },
                        data: { deletedAt: new Date() }
                    });
                    
                    // Borrar el archivo de video asociado para que la cola lo ignore
                    await prisma.videoFile.deleteMany({
                        where: { contentId: dup.id }
                    });
                    
                    deletedCount++;
                } else {
                    console.log(` ⏩ Omitiendo duplicado NO PENDIENTE: ${dup.slug} (Estado: ${dup.status})`);
                }
            }
        }
    }

    console.log(`\n✅ Limpieza completada. Se eliminaron ${deletedCount} duplicados pendientes.`);
}

run().catch(console.error).finally(() => process.exit(0));
