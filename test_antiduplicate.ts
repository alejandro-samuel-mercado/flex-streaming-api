import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const TMP = '/tmp/test_scanner_dupes_2';
const MOVIE_NAME = 'test_unique_movie_998877';
const OLD_FOLDER = path.join(TMP, MOVIE_NAME);
const NEW_FOLDER = path.join(TMP, 'videos_subidos', MOVIE_NAME);

let testContentId = '';
let testVideoFileId = '';
let passed = 0;
let failed = 0;

function ok(msg: string) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg: string) { console.log(`  ❌ FALLO: ${msg}`); failed++; }

async function cleanup() {
    await prisma.videoFile.deleteMany({ where: { originalPath: { contains: 'test_unique_movie' } } }).catch(() => {});
    await prisma.content.deleteMany({ where: { translations: { some: { title: { contains: 'test_unique_movie' } } } } }).catch(() => {});
    fs.rmSync(TMP, { recursive: true, force: true });
}

async function main() {
    await cleanup();
    fs.mkdirSync(OLD_FOLDER, { recursive: true });
    fs.mkdirSync(NEW_FOLDER, { recursive: true });
    fs.writeFileSync(path.join(OLD_FOLDER, 'master.m3u8'), '#EXTM3U\n');
    fs.writeFileSync(path.join(NEW_FOLDER, 'master.m3u8'), '#EXTM3U\n');

    console.log('PASO 1: Scanner inicial');
    const result1 = await MediaScannerService.importFile(OLD_FOLDER, 'MOVIE', {
        m3u8Path: path.join(OLD_FOLDER, 'master.m3u8'),
        season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: ''
    });
    console.log(`   → Resultado: success=${result1.success}, contentId=${result1.contentId}`);
    testContentId = result1.contentId || '';

    console.log('\nPASO 2: Renombrar en panel');
    await prisma.contentTranslation.updateMany({
        where: { contentId: testContentId, language: 'es' },
        data: { title: 'test_unique_movie_RENAMED' }
    });
    await prisma.content.update({
        where: { id: testContentId },
        data: { status: 'ACTIVE', isPinned: true, tmdbId: '999999999' }
    });

    console.log('\nPASO 3: Cron mueve archivo');

    console.log('\nPASO 4: Scanner corre con NUEVA ruta');
    const result2 = await MediaScannerService.importFile(NEW_FOLDER, 'MOVIE', {
        m3u8Path: path.join(NEW_FOLDER, 'master.m3u8'),
        season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: ''
    });
    console.log(`   → Resultado: success=${result2.success}, contentId=${result2.contentId}`);

    const vfs = await prisma.videoFile.findMany({ where: { contentId: testContentId } });
    console.log(`\nVERIFICACIÓN: El Content tiene ${vfs.length} VideoFiles.`);
    for (const v of vfs) {
        console.log(`   - ID: ${v.id} | Path: ${v.originalPath}`);
    }

    await cleanup();
    await prisma.$disconnect();
}
main();
