import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function removeDuplicates() {
    console.log("🔍 Buscando películas duplicadas por archivo físico...");

    // 1. Obtener todos los VideoFiles de películas
    const videoFiles = await prisma.videoFile.findMany({
        where: { type: 'MOVIE' },
        include: { content: true }
    });

    // 2. Agrupar por nombre de archivo Y película (para detectar copias en distintas carpetas)
    const groups: Record<string, typeof videoFiles> = {};
    for (const vf of videoFiles) {
        if (!vf.originalPath) continue;
        
        // Extraemos solo el nombre del archivo (ej: "con amor.mp4")
        const fileName = vf.originalPath.split('/').pop()?.toLowerCase() || '';
        
        // Usamos el TMDB ID o el título como seguro para no borrar películas distintas que se llamen "video.mp4"
        const safeKey = vf.content?.tmdbId || vf.content?.title || 'unknown';
        
        const groupKey = `${fileName}_${safeKey}`;
        
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(vf);
    }

    let deletedCount = 0;

    for (const [pathLower, files] of Object.entries(groups)) {
        if (files.length > 1) {
            console.log(`\n⚠️  Encontrado archivo duplicado: ${files[0].originalPath}`);
            console.log(`   Tiene ${files.length} registros en la base de datos.`);

            // Ordenar por fecha de creación (el más antiguo primero)
            files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            // Nos quedamos con el más antiguo (el original)
            const original = files[0];
            console.log(`   ✅ Conservando el original: ID ${original.contentId} (Creado: ${original.createdAt.toLocaleDateString()})`);

            // Borramos los más nuevos
            for (let i = 1; i < files.length; i++) {
                const duplicate = files[i];
                console.log(`   🗑️  Borrando duplicado: ID ${duplicate.contentId} (Creado: ${duplicate.createdAt.toLocaleDateString()})`);
                
                // Borrar el VideoFile duplicado
                await prisma.videoFile.delete({ where: { id: duplicate.id } });
                
                // Borrar el Content duplicado si existe
                if (duplicate.contentId) {
                    try {
                        // Hard delete del content duplicado para limpiar completamente
                        await prisma.content.delete({ where: { id: duplicate.contentId } });
                    } catch (e) {
                        console.log(`      (Nota: El contenido ya no existía o no se pudo borrar por completo)`);
                    }
                }
                deletedCount++;
            }
        }
    }

    console.log(`\n✅ ¡Limpieza de duplicados terminada! Se eliminaron ${deletedCount} registros duplicados.`);
}

removeDuplicates()
    .catch(e => console.error(e))
    .finally(() => process.exit(0));
