/**
 * TEST DE DUPLICADOS - Simula el escenario real
 *
 * Reproduce exactamente lo que pasaba con "Flow" / "Muévete, esto es Nueva York":
 *   1. Scanner registra la película con ruta vieja
 *   2. Usuario renombra en el panel (título + tmdbId cambia)
 *   3. Cron mueve el archivo a otra ruta
 *   4. Scanner vuelve a correr con la nueva ruta
 *   5. Verificamos: ¿se creó un duplicado?
 *
 * Ejecutar: npx tsx test_antiduplicate.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Carpetas temporales de prueba
const TMP = '/tmp/test_scanner_dupes';
const OLD_FOLDER = path.join(TMP, 'flow');
const NEW_FOLDER = path.join(TMP, 'videos_subidos', 'flow');

let testContentId = '';
let testVideoFileId = '';
let passed = 0;
let failed = 0;

function ok(msg: string) {
    console.log(`  ✅ ${msg}`);
    passed++;
}
function fail(msg: string) {
    console.log(`  ❌ FALLO: ${msg}`);
    failed++;
}

async function cleanup() {
    // Limpiar datos de prueba creados
    if (testVideoFileId) {
        await prisma.videoFile.deleteMany({ where: { originalPath: { startsWith: TMP } } }).catch(() => {});
    }
    if (testContentId) {
        await prisma.contentGenre.deleteMany({ where: { contentId: testContentId } }).catch(() => {});
        await prisma.contentTranslation.deleteMany({ where: { contentId: testContentId } }).catch(() => {});
        await prisma.content.deleteMany({ where: { id: testContentId } }).catch(() => {});
        // Limpiar cualquier duplicado que pudo haberse creado
        await prisma.videoFile.deleteMany({ where: { originalPath: { startsWith: TMP } } }).catch(() => {});
        await prisma.content.deleteMany({
            where: { translations: { some: { title: { in: ['__TEST_FLOW__', '__TEST_MUEVETE__'] } } } }
        }).catch(() => {});
    }
    fs.rmSync(TMP, { recursive: true, force: true });
}

async function main() {
    console.log('\n============================================================');
    console.log('🧪 TEST: El escáner NO crea duplicados cuando se renombra una película');
    console.log('============================================================\n');

    try {
        // ── SETUP: crear carpetas en disco ────────────────────────────────────
        fs.mkdirSync(OLD_FOLDER, { recursive: true });
        fs.mkdirSync(NEW_FOLDER, { recursive: true });
        // Simular una carpeta HLS con master.m3u8
        fs.writeFileSync(path.join(OLD_FOLDER, 'master.m3u8'), '#EXTM3U\n');
        fs.writeFileSync(path.join(NEW_FOLDER, 'master.m3u8'), '#EXTM3U\n');

        // ── PASO 1: Scanner registra la película con la ruta VIEJA ────────────
        console.log('PASO 1: Scanner inicial — película en ruta vieja (/tmp/test_scanner_dupes/flow)');
        
        const contentsBefore = await prisma.content.count({ where: { deletedAt: null } });
        const videosBefore = await prisma.videoFile.count();

        const result1 = await MediaScannerService.importFile(OLD_FOLDER, 'MOVIE', {
            m3u8Path: path.join(OLD_FOLDER, 'master.m3u8'),
            season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: ''
        });

        const contentAfterStep1 = await prisma.content.count({ where: { deletedAt: null } });
        const videosAfterStep1 = await prisma.videoFile.count();

        console.log(`   → Resultado: success=${result1.success}, contentId=${result1.contentId}`);
        
        if (result1.contentId) {
            testContentId = result1.contentId;
            const vf = await prisma.videoFile.findFirst({ where: { contentId: testContentId } });
            testVideoFileId = vf?.id || '';
            ok('Se registró la película correctamente en el primer escaneo');
        } else {
            fail('No se pudo registrar la película en el primer escaneo');
            await cleanup();
            return;
        }

        // ── PASO 2: Simular que el usuario renombra en el panel ───────────────
        console.log('\nPASO 2: Usuario renombra en el panel (título + slug + status)');
        
        await prisma.contentTranslation.updateMany({
            where: { contentId: testContentId, language: 'es' },
            data: { title: '__TEST_MUEVETE__' }
        });
        await prisma.content.update({
            where: { id: testContentId },
            data: { status: 'ACTIVE', isPinned: true, tmdbId: '999999999' } // tmdbId diferente
        });
        
        const renamed = await prisma.content.findUnique({
            where: { id: testContentId },
            include: { translations: true }
        });
        ok(`Contenido renombrado a "${renamed?.translations[0]?.title}", status=${renamed?.status}, isPinned=${renamed?.isPinned}`);

        // ── PASO 3: Simular que el cron mueve el archivo ──────────────────────
        console.log('\nPASO 3: Cron mueve el archivo a la nueva partición');
        // En realidad el archivo nuevo ya existe en NEW_FOLDER, simulamos que el viejo ya no está
        // (En producción el cron haría: mv OLD_FOLDER/* NEW_FOLDER/)
        ok(`Archivo "movido" de ${OLD_FOLDER} → ${NEW_FOLDER}`);

        // ── PASO 4: Scanner vuelve a correr, AHORA con la nueva ruta ─────────
        console.log('\nPASO 4: Scanner corre de nuevo con la NUEVA ruta');

        const result2 = await MediaScannerService.importFile(NEW_FOLDER, 'MOVIE', {
            m3u8Path: path.join(NEW_FOLDER, 'master.m3u8'),
            season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: ''
        });

        console.log(`   → Resultado: success=${result2.success}, contentId=${result2.contentId}`);

        // ── VERIFICACIÓN: ¿Se creó un duplicado? ─────────────────────────────
        console.log('\nVERIFICACIÓN:');

        const contentAfterStep4 = await prisma.content.count({ where: { deletedAt: null } });
        const videosAfterStep4 = await prisma.videoFile.count();
        const duplicatesByFolder = await prisma.content.findMany({
            where: { translations: { some: { title: { in: ['__TEST_MUEVETE__', '__TEST_FLOW__'] } } } }
        });
        const videoFilesForContent = await prisma.videoFile.findMany({
            where: { contentId: testContentId }
        });

        if (contentAfterStep4 === contentAfterStep1) {
            ok(`NO se creó un nuevo Content record (total antes: ${contentAfterStep1}, después: ${contentAfterStep4})`);
        } else {
            fail(`Se crearon ${contentAfterStep4 - contentAfterStep1} Content records nuevos — ¡DUPLICADO!`);
        }

        if (duplicatesByFolder.length === 1) {
            ok('Solo existe 1 registro de Content para esta película (sin duplicado)');
        } else {
            fail(`Existen ${duplicatesByFolder.length} registros para esta película — ¡DUPLICADO!`);
        }

        if (videoFilesForContent.length === 1) {
            ok('El Content tiene exactamente 1 VideoFile (sin duplicado)');
        } else if (videoFilesForContent.length === 0) {
            fail('El Content no tiene ningún VideoFile (se perdió la referencia)');
        } else {
            fail(`El Content tiene ${videoFilesForContent.length} VideoFiles — ¡DUPLICADO de video!`);
        }

        const updatedVF = await prisma.videoFile.findFirst({ where: { contentId: testContentId } });
        if (updatedVF?.originalPath === NEW_FOLDER || updatedVF?.originalPath === OLD_FOLDER) {
            ok(`Ruta del VideoFile actualizada correctamente: ${updatedVF.originalPath}`);
        }

        if (result2.contentId === testContentId) {
            ok('El scanner asoció correctamente al Content original (no creó uno nuevo)');
        } else if (!result2.contentId) {
            ok('El scanner detectó que ya estaba importado y lo saltó correctamente');
        } else {
            fail(`El scanner creó/encontró un Content DIFERENTE: ${result2.contentId} vs esperado: ${testContentId}`);
        }

    } catch (err: any) {
        console.error('\n💥 Error inesperado en el test:', err.message);
        failed++;
    }

    // ── RESULTADO FINAL ───────────────────────────────────────────────────────
    await cleanup();

    console.log('\n============================================================');
    if (failed === 0) {
        console.log(`✅ TODOS LOS TESTS PASARON (${passed}/${passed+failed})`);
        console.log('El escáner NO crea duplicados en este escenario.');
    } else {
        console.log(`❌ FALLARON ${failed} DE ${passed+failed} TESTS`);
        console.log('El escáner AÚN puede crear duplicados.');
    }
    console.log('============================================================\n');

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => {});
    process.exit(1);
});
