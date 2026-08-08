/**
 * SCRIPT DE DIAGNÓSTICO DE DUPLICADOS
 * Ejecutar en el servidor de películas con:
 *   npx tsx diagnostico_duplicados.ts
 *
 * Muestra:
 *  1. Películas duplicadas por tmdbId
 *  2. VideoFiles con rutas en la vieja partición /home/media/peliculas
 *     que posiblemente ya están en /home/peliplus_gran_disco/videos_subidos
 *  3. Contenidos ACTIVE+PINNED que tienen más de un VideoFile (duplicados activos)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('\n========================================');
    console.log('🔍 DIAGNÓSTICO DE DUPLICADOS - PELÍCULAS');
    console.log('========================================\n');

    // ── 1. DUPLICADOS POR TMDB ID ─────────────────────────────────────────────
    console.log('📌 [1/4] Buscando duplicados por TMDB ID...\n');

    const allContents = await prisma.content.findMany({
        where: { deletedAt: null, tmdbId: { not: null } },
        include: {
            translations: { where: { language: 'es' }, select: { title: true } },
            videoFiles: { select: { id: true, originalPath: true, status: true, masterPlaylist: true } }
        },
        orderBy: { tmdbId: 'asc' }
    });

    const byTmdbId = new Map<string, typeof allContents>();
    for (const c of allContents) {
        if (!c.tmdbId) continue;
        if (!byTmdbId.has(c.tmdbId)) byTmdbId.set(c.tmdbId, []);
        byTmdbId.get(c.tmdbId)!.push(c);
    }

    let dupCount = 0;
    for (const [tmdbId, contents] of byTmdbId) {
        if (contents.length > 1) {
            dupCount++;
            console.log(`\n⚠️  TMDB ID ${tmdbId} — ${contents.length} registros:`);
            for (const c of contents) {
                const title = c.translations[0]?.title || '(sin título)';
                const vf = c.videoFiles[0];
                const pathOk = vf ? (fs.existsSync(vf.originalPath) ? '✅ EXISTE EN DISCO' : '❌ NO EN DISCO') : '(sin video)';
                const status = `${c.status}${c.isPinned ? ' 📌PINNED' : ''}`;
                console.log(`   ID: ${c.id} | Título: "${title}" | Estado: ${status}`);
                console.log(`   VideoFile: ${vf?.originalPath || 'ninguno'} — ${pathOk}`);
            }
        }
    }
    console.log(`\n→ Total grupos duplicados por TMDB ID: ${dupCount}\n`);

    // ── 2. RUTAS HUÉRFANAS (viejas rutas que ya no existen en disco) ────────
    console.log('\n📂 [2/4] Buscando VideoFiles con rutas que NO existen en disco...\n');
    const allVideos = await prisma.videoFile.findMany({
        where: { status: { in: ['COMPLETED', 'QUEUED', 'PROCESSING'] } },
        include: { content: { select: { isPinned: true, status: true, translations: { where: { language: 'es' }, select: { title: true } } } } }
    });

    let missingPaths = 0;
    for (const v of allVideos) {
        if (v.originalPath && !fs.existsSync(v.originalPath)) {
            missingPaths++;
            const title = v.content?.translations?.[0]?.title || '(sin título)';
            const pinned = v.content?.isPinned ? '📌 PINNED' : '';
            if (missingPaths <= 40) {
                console.log(`   ❌ ${v.status} | ${pinned} "${title}"`);
                console.log(`      Ruta: ${v.originalPath}`);
            }
        }
    }
    if (missingPaths > 40) console.log(`   ... y ${missingPaths - 40} más.`);
    console.log(`\n→ Total VideoFiles con ruta INEXISTENTE en disco: ${missingPaths}\n`);

    // ── 3. CONTENIDOS ACTIVE+PINNED CON MÁS DE UN VIDEOFILE ─────────────────
    console.log('\n🛡️  [3/4] Contenidos ACTIVE+PINNED con más de un VideoFile (CRÍTICO)...\n');
    const activeVideos = await prisma.content.findMany({
        where: { status: 'ACTIVE', isPinned: true, deletedAt: null },
        include: {
            translations: { where: { language: 'es' }, select: { title: true } },
            videoFiles: { select: { id: true, originalPath: true, status: true, createdAt: true } }
        }
    });

    let activeDupCount = 0;
    for (const c of activeVideos) {
        if (c.videoFiles.length > 1) {
            activeDupCount++;
            const title = c.translations[0]?.title || '(sin título)';
            console.log(`\n🚨 "${title}" (id: ${c.id}) tiene ${c.videoFiles.length} VideoFiles:`);
            for (const vf of c.videoFiles) {
                const diskOk = fs.existsSync(vf.originalPath) ? '✅' : '❌ NO EN DISCO';
                console.log(`   [${vf.createdAt.toISOString()}] ${vf.status} ${diskOk}: ${vf.originalPath}`);
            }
        }
    }
    if (activeDupCount === 0) console.log('   ✅ Ningún contenido ACTIVE+PINNED tiene VideoFiles duplicados.');
    console.log(`\n→ Total contenidos ACTIVE+PINNED con VideoFile duplicado: ${activeDupCount}\n`);

    // ── 4. RESUMEN DE RUTAS POR PARTICIÓN ────────────────────────────────────
    console.log('\n📊 [4/4] Distribución de rutas por partición...\n');
    const allVFs = await prisma.videoFile.findMany({ select: { originalPath: true } });
    const OLD_PATH = '/home/media/peliculas';
    const NEW_PATH = '/home/peliplus_gran_disco';
    let oldCount = 0, newCount = 0, otherCount = 0;
    for (const v of allVFs) {
        if (v.originalPath.startsWith(OLD_PATH)) oldCount++;
        else if (v.originalPath.startsWith(NEW_PATH)) newCount++;
        else otherCount++;
    }
    console.log(`   Rutas en ${OLD_PATH}: ${oldCount}`);
    console.log(`   Rutas en ${NEW_PATH}: ${newCount}`);
    console.log(`   Otras rutas: ${otherCount}`);

    console.log('\n========================================');
    console.log('✅ DIAGNÓSTICO COMPLETO');
    console.log('========================================\n');

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
