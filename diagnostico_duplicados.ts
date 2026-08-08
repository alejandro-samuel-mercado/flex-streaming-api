/**
 * SCRIPT DE DIAGNÓSTICO DE DUPLICADOS v2
 * Busca duplicados por tmdbId Y por título, y también muestra un plan de limpieza.
 * Ejecutar en el servidor:
 *   npx tsx diagnostico_duplicados.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('\n========================================');
    console.log('🔍 DIAGNÓSTICO DE DUPLICADOS v2 - PELÍCULAS');
    console.log('========================================\n');

    // ── 1. DUPLICADOS POR TMDB ID ─────────────────────────────────────────────
    console.log('📌 [1/5] Buscando duplicados por TMDB ID...\n');
    const allContents = await prisma.content.findMany({
        where: { deletedAt: null },
        include: {
            translations: { where: { language: 'es' }, select: { title: true } },
            videoFiles: { select: { id: true, originalPath: true, status: true, createdAt: true } }
        },
        orderBy: { createdAt: 'asc' }
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
                const pathOk = vf ? (fs.existsSync(vf.originalPath) ? '✅' : '❌ NO EN DISCO') : '(sin video)';
                console.log(`   ID: ${c.id} | "${title}" | ${c.status}${c.isPinned ? ' 📌' : ''} | Video: ${vf?.originalPath || 'ninguno'} ${pathOk}`);
            }
        }
    }
    console.log(`\n→ Total duplicados por TMDB ID: ${dupCount}`);

    // ── 2. DUPLICADOS POR TÍTULO (el bug real) ────────────────────────────────
    console.log('\n\n🔤 [2/5] Buscando duplicados por TÍTULO...\n');
    const byTitle = new Map<string, typeof allContents>();
    for (const c of allContents) {
        const title = c.translations[0]?.title?.trim().toLowerCase();
        if (!title || title === '(sin título)') continue;
        if (!byTitle.has(title)) byTitle.set(title, []);
        byTitle.get(title)!.push(c);
    }

    let titleDupCount = 0;
    const titleDupGroups: any[] = [];
    for (const [title, contents] of byTitle) {
        if (contents.length > 1) {
            titleDupCount++;
            console.log(`\n⚠️  Título: "${contents[0].translations[0]?.title}" — ${contents.length} registros:`);
            for (const c of contents) {
                const vf = c.videoFiles[0];
                const pathOk = vf
                    ? (fs.existsSync(vf.originalPath) ? '✅ EN DISCO' : '❌ NO EN DISCO')
                    : '(sin video)';
                const tag = c.isPinned && c.status === 'ACTIVE' ? '🏆 KEEPER (ACTIVE+PINNED)' 
                           : c.isPinned ? '📌 PINNED'
                           : c.status === 'ACTIVE' ? '⚡ ACTIVE'
                           : '🗑️  CANDIDATO A BORRAR';
                console.log(`   [${tag}] ID: ${c.id} | slug: ${c.slug}`);
                console.log(`   tmdbId: ${c.tmdbId || 'NULL'} | Estado: ${c.status}`);
                if (vf) console.log(`   Video: ${vf.originalPath} — ${pathOk}`);
                else console.log(`   Video: (ninguno)`);
            }
            titleDupGroups.push({ title, contents });
        }
    }
    console.log(`\n→ Total duplicados por título: ${titleDupCount}`);

    // ── 3. PLAN DE LIMPIEZA AUTOMÁTICA ───────────────────────────────────────
    if (titleDupGroups.length > 0) {
        console.log('\n\n🧹 [3/5] PLAN DE LIMPIEZA (qué borrar)...\n');
        console.log('Regla: Se CONSERVA el que es ACTIVE+PINNED. Si ninguno lo es, se conserva');
        console.log('       el que tiene video en disco. Se BORRA el resto.\n');

        for (const { title, contents } of titleDupGroups) {
            // Elegir el keeper: ACTIVE+PINNED > PINNED > ACTIVE > tiene video en disco > el más reciente
            const keeper = contents.find(c => c.isPinned && c.status === 'ACTIVE')
                        || contents.find(c => c.isPinned)
                        || contents.find(c => c.status === 'ACTIVE')
                        || contents.find(c => c.videoFiles[0] && fs.existsSync(c.videoFiles[0].originalPath))
                        || contents[contents.length - 1];

            const toDelete = contents.filter(c => c.id !== keeper.id);
            console.log(`"${contents[0].translations[0]?.title}":`);
            console.log(`  ✅ CONSERVAR: ${keeper.id} (${keeper.status}${keeper.isPinned ? '+PINNED' : ''})`);
            for (const d of toDelete) {
                const hasVideo = d.videoFiles[0] && fs.existsSync(d.videoFiles[0].originalPath);
                console.log(`  🗑️  BORRAR:    ${d.id} (${d.status}) ${hasVideo ? '— ⚠️  TIENE VIDEO EN DISCO, mover al keeper primero' : ''}`);
            }
            console.log();
        }
    }

    // ── 4. ACTIVE+PINNED CON MÁS DE 1 VIDEOFILE ─────────────────────────────
    console.log('\n🛡️  [4/5] Contenidos ACTIVE+PINNED con más de un VideoFile...\n');
    let activeDupCount = 0;
    for (const c of allContents.filter(c => c.isPinned && c.status === 'ACTIVE')) {
        if (c.videoFiles.length > 1) {
            activeDupCount++;
            const title = c.translations[0]?.title || '(sin título)';
            console.log(`\n🚨 "${title}" (id: ${c.id}) tiene ${c.videoFiles.length} VideoFiles:`);
            for (const vf of c.videoFiles) {
                const diskOk = fs.existsSync(vf.originalPath) ? '✅' : '❌ NO EN DISCO';
                console.log(`   [${vf.createdAt.toISOString()}] ${vf.status} ${diskOk}: ${vf.originalPath}`);
            }
            console.log(`   → Para limpiar, borra el VideoFile más viejo que NO tenga video en disco.`);
        }
    }
    if (activeDupCount === 0) console.log('   ✅ Ningún contenido ACTIVE+PINNED tiene VideoFiles duplicados.');

    // ── 5. RESUMEN DE PARTICIONES ─────────────────────────────────────────────
    console.log('\n\n📊 [5/5] Distribución de rutas por partición...\n');
    const allVFs = await prisma.videoFile.findMany({ select: { originalPath: true, status: true } });
    const OLD_PATH = '/home/media/peliculas';
    const NEW_PATH = '/home/peliplus_gran_disco';
    const SERIES_PATH = '/home/media/series';
    let oldCount = 0, newCount = 0, seriesCount = 0, otherCount = 0;
    let oldMissing = 0, newMissing = 0;
    for (const v of allVFs) {
        if (v.originalPath.startsWith(OLD_PATH)) {
            oldCount++;
            if (!fs.existsSync(v.originalPath)) oldMissing++;
        } else if (v.originalPath.startsWith(NEW_PATH)) {
            newCount++;
            if (!fs.existsSync(v.originalPath)) newMissing++;
        } else if (v.originalPath.startsWith(SERIES_PATH)) {
            seriesCount++;
        } else {
            otherCount++;
        }
    }
    console.log(`   ${OLD_PATH}: ${oldCount} registros (${oldMissing} sin archivo en disco)`);
    console.log(`   ${NEW_PATH}: ${newCount} registros (${newMissing} sin archivo en disco)`);
    console.log(`   ${SERIES_PATH}: ${seriesCount} registros (chequeo omitido, son series)`);
    console.log(`   Otras: ${otherCount}`);

    console.log('\n========================================');
    console.log('✅ DIAGNÓSTICO COMPLETO');
    console.log('========================================\n');

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
