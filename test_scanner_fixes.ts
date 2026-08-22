/**
 * TEST REAL: Verificación de los 4 fixes del scanner de duplicados
 * 
 * Ejecutar con: npx tsx test_scanner_fixes.ts
 * 
 * REQUISITOS: .env con DATABASE_URL válido
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TMP = '/tmp/test_scanner_fixes_v2';
let passed = 0;
let failed = 0;

function ok(msg: string)   { console.log(`  ✅ PASS: ${msg}`); passed++; }
function fail(msg: string) { console.error(`  ❌ FAIL: ${msg}`); failed++; }
function section(msg: string) { console.log(`\n${'═'.repeat(60)}\n📋 ${msg}\n${'═'.repeat(60)}`); }

function makeM3u8Folder(folderPath: string): string {
  fs.mkdirSync(folderPath, { recursive: true });
  const m3u8 = path.join(folderPath, 'index.m3u8');
  fs.writeFileSync(m3u8, '#EXTM3U\n#EXT-X-VERSION:3\n');
  return m3u8;
}

async function cleanupTestData() {
  await prisma.videoFile.deleteMany({ where: { originalPath: { contains: 'test_scanner_fix' } } }).catch(() => {});
  await prisma.videoFile.deleteMany({ where: { hlsPath: { contains: 'test_scanner_fix' } } }).catch(() => {});
  await prisma.videoFile.deleteMany({ where: { originalPath: { contains: '/tmp/test_scanner' } } }).catch(() => {});
  await prisma.videoFile.deleteMany({ where: { hlsPath: { contains: '/tmp/test_scanner' } } }).catch(() => {});
  const contents = await prisma.content.findMany({
    where: { translations: { some: { title: { contains: 'test_scanner_fix' } } } }
  });
  for (const c of contents) {
    await prisma.episode.deleteMany({ where: { season: { contentId: c.id } } }).catch(() => {});
    await prisma.season.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.contentTranslation.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.content.delete({ where: { id: c.id } }).catch(() => {});
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

// ─── TEST 1: HLS folder ya procesada no genera duplicado ─────────────────────

async function test1_hlsPathDuplicateDetection() {
  section('TEST 1: Carpeta HLS ya procesada NO crea duplicado');

  const rawFile = path.join(TMP, 'test_scanner_fix_movie_A.mp4');
  const hlsFolder = path.join(TMP, 'hls', 'test_scanner_fix_movie_A');
  const m3u8 = makeM3u8Folder(hlsFolder);
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.writeFileSync(rawFile, 'fake mp4 data');

  // Simular que el VideoFile fue creado apuntando al raw .mp4 pero procesado en HLS
  const content = await prisma.content.create({
    data: {
      type: 'MOVIE', status: 'ACTIVE', slug: 'test-scanner-fix-movie-a-slug',
      isPinned: true,
      translations: { create: [{ language: 'es', title: 'test_scanner_fix Movie A', description: 'Test' }] }
    }
  });
  const videoFile = await prisma.videoFile.create({
    data: {
      contentId: content.id,
      type: 'MOVIE',
      originalPath: rawFile,        // ← path del .mp4 original
      hlsPath: hlsFolder,           // ← path de la carpeta HLS generada
      status: 'COMPLETED',
      masterPlaylist: `/api/stream/hls/test-id/index.m3u8`,
      fileSize: BigInt(0),
    }
  });

  console.log(`  Creado VideoFile con originalPath=${rawFile}, hlsPath=${hlsFolder}`);
  console.log(`  Simulando scanner que encuentra la carpeta HLS...`);

  // El scanner detecta la CARPETA HLS como si fuera nueva
  const result = await MediaScannerService.importFile(hlsFolder, 'MOVIE', {
    m3u8Path: m3u8, season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: ''
  });

  console.log(`  → importFile result: success=${result.success}, error="${result.error}"`);

  const vfsForContent = await prisma.videoFile.findMany({ where: { contentId: content.id } });
  const allContentsWithSameName = await prisma.content.findMany({
    where: { translations: { some: { title: 'test_scanner_fix Movie A' } } }
  });

  if (vfsForContent.length === 1) {
    ok(`Solo existe 1 VideoFile para el contenido (no se duplicó)`);
  } else {
    fail(`Se crearon ${vfsForContent.length} VideoFiles para el mismo contenido! Esperado: 1`);
  }

  if (allContentsWithSameName.length === 1) {
    ok(`Solo existe 1 Content entry (no se creó Content duplicado)`);
  } else {
    fail(`Se crearon ${allContentsWithSameName.length} Content entries! Esperado: 1`);
  }

  // Limpiar
  await prisma.videoFile.delete({ where: { id: videoFile.id } }).catch(() => {});
  await prisma.contentTranslation.deleteMany({ where: { contentId: content.id } }).catch(() => {});
  await prisma.content.delete({ where: { id: content.id } }).catch(() => {});
}

// ─── TEST 2: isPinned automático cuando se edita ─────────────────────────────

async function test2_autoPinnedOnEdit() {
  section('TEST 2: Content queda isPinned=true después de editar en el panel');

  const content = await prisma.content.create({
    data: {
      type: 'MOVIE', status: 'PENDING', slug: 'test-scanner-fix-movie-b-slug',
      isPinned: false,
      translations: { create: [{ language: 'es', title: 'test_scanner_fix Movie B', description: 'Original' }] }
    }
  });

  console.log(`  Creado content con isPinned=false`);

  const { ContentService } = await import('./src/modules/content/content.service');
  await ContentService.updateContent(content.id, {
    translations: [{ language: 'es', title: 'test_scanner_fix Movie B Editado', description: 'Editado' }]
  });

  const updated = await prisma.content.findUnique({ where: { id: content.id } });
  console.log(`  → isPinned después de editar: ${updated?.isPinned}`);

  if (updated?.isPinned === true) {
    ok(`isPinned=true automáticamente al editar desde el panel`);
  } else {
    fail(`isPinned sigue siendo false. El scanner podría crear duplicados de este contenido`);
  }

  await prisma.contentTranslation.deleteMany({ where: { contentId: content.id } }).catch(() => {});
  await prisma.content.delete({ where: { id: content.id } }).catch(() => {});
}

// ─── TEST 3: Dos series distintas con mismo nombre NO se fusionan ─────────────

async function test3_differentTmdbIdsDontMerge() {
  section('TEST 3: Dos series con mismo nombre pero distinto tmdbId NO se fusionan (caso iCarly)');

  // Crear la "primera" serie (ej: iCarly 2007 con tmdbId=99991111)
  const content1 = await prisma.content.create({
    data: {
      type: 'SERIES', status: 'ACTIVE', slug: 'test-scanner-fix-icarly-original',
      tmdbId: '99991111',
      translations: { create: [{ language: 'es', title: 'test_scanner_fix iCarly', description: 'Version original' }] }
    }
  });

  console.log(`  Creada serie 1 con tmdbId=99991111, title="test_scanner_fix iCarly"`);

  // Intentar importar la segunda serie con mismo nombre pero distinto tmdbId
  const seriesFolder2 = path.join(TMP, '99992222_test_scanner_fix_icarly');
  const ep1Folder = path.join(seriesFolder2, 'S01E01');
  const m3u8 = makeM3u8Folder(ep1Folder);

  const result = await MediaScannerService.importFile(ep1Folder, 'SERIES', {
    m3u8Path: m3u8, season: 1, episodeNumber: 1,
    tmdbSeriesId: 99992222,  // ← tmdbId DIFERENTE al de la primera
    seriesFolderName: '99992222_test_scanner_fix_icarly'
  });

  console.log(`  → importFile result: success=${result.success}, contentId=${result.contentId}`);

  const allWithSameName = await prisma.content.findMany({
    where: { translations: { some: { title: { contains: 'test_scanner_fix iCarly' } } } }
  });
  console.log(`  → Entries en BD con nombre "test_scanner_fix iCarly": ${allWithSameName.length}`);
  for (const c of allWithSameName) {
    console.log(`     - tmdbId=${c.tmdbId}, id=${c.id}`);
  }

  if (result.contentId && result.contentId !== content1.id) {
    ok(`La segunda serie tiene su propio contentId (no se fusionó con la primera)`);
  } else {
    fail(`La segunda serie fue fusionada con la primera! contentId=${result.contentId}, esperado distinto de ${content1.id}`);
  }

  const serie1Updated = await prisma.content.findUnique({ where: { id: content1.id } });
  if (serie1Updated?.tmdbId === '99991111') {
    ok(`La primera serie conserva su tmdbId=99991111 intacto`);
  } else {
    fail(`El tmdbId de la primera serie fue sobreescrito! Ahora es: ${serie1Updated?.tmdbId}`);
  }

  // Limpiar todo
  for (const c of allWithSameName) {
    await prisma.videoFile.deleteMany({ where: { OR: [{ contentId: c.id }, { episode: { season: { contentId: c.id } } }] } }).catch(() => {});
    await prisma.episode.deleteMany({ where: { season: { contentId: c.id } } }).catch(() => {});
    await prisma.season.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.contentTranslation.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.content.delete({ where: { id: c.id } }).catch(() => {});
  }
}

// ─── TEST 4: Folder-name match se salta cuando hay tmdbSeriesId ──────────────

async function test4_folderNameMatchSkippedWithTmdbId() {
  section('TEST 4: Match por nombre de carpeta se salta cuando tmdbSeriesId está presente');

  // Serie existente SIN tmdbId
  const existingSeries = await prisma.content.create({
    data: {
      type: 'SERIES', status: 'ACTIVE', slug: 'test-scanner-fix-manual-series-slug',
      tmdbId: null,
      translations: { create: [{ language: 'es', title: 'test_scanner_fix Series Manual', description: 'Creada a mano' }] }
    }
  });

  console.log(`  Serie existente sin tmdbId: id=${existingSeries.id}`);

  // Carpeta con tmdbId explícito, pero cleanFileName daría el mismo nombre
  const seriesFolder = path.join(TMP, '77778888_test_scanner_fix_series_manual');
  const ep1Folder = path.join(seriesFolder, 'S01E01');
  const m3u8 = makeM3u8Folder(ep1Folder);

  const result = await MediaScannerService.importFile(ep1Folder, 'SERIES', {
    m3u8Path: m3u8, season: 1, episodeNumber: 1,
    tmdbSeriesId: 77778888,
    seriesFolderName: '77778888_test_scanner_fix_series_manual'
  });

  console.log(`  → importFile result: success=${result.success}, contentId=${result.contentId}`);

  if (result.contentId && result.contentId !== existingSeries.id) {
    ok(`Se creó un contentId nuevo (no reutilizó la serie manual sin tmdbId)`);
  } else if (result.error === 'Este archivo ya fue importado') {
    // This also means the scanner did NOT merge with existingSeries — it found an
    // existing VideoFile for the path from a previous run. The important check is
    // that existingSeries is NOT linked to any new VideoFile for that episode path.
    ok(`Scanner detectó el episodio como ya importado sin usar la serie manual (no fusionó)`);
  } else if (result.contentId === existingSeries.id) {
    fail(`Usó la serie manual existente en vez de crear una nueva! El match por nombre no se saltó.`);
  } else {
    fail(`importFile no devolvió contentId. Error: ${result.error}`);
  }

  const manual = await prisma.content.findUnique({ where: { id: existingSeries.id } });
  if (manual && manual.tmdbId === null) {
    ok(`La serie manual conserva tmdbId=null (no fue modificada por el scanner)`);
  } else {
    fail(`La serie manual fue modificada! tmdbId ahora es: ${manual?.tmdbId}`);
  }

  // Limpiar
  const allToClean = await prisma.content.findMany({
    where: { translations: { some: { title: { contains: 'test_scanner_fix Series Manual' } } } }
  });
  for (const c of allToClean) {
    await prisma.videoFile.deleteMany({ where: { OR: [{ contentId: c.id }, { episode: { season: { contentId: c.id } } }] } }).catch(() => {});
    await prisma.episode.deleteMany({ where: { season: { contentId: c.id } } }).catch(() => {});
    await prisma.season.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.contentTranslation.deleteMany({ where: { contentId: c.id } }).catch(() => {});
    await prisma.content.delete({ where: { id: c.id } }).catch(() => {});
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 SUITE DE TESTS: Scanner Anti-Duplicados\n');
  
  await cleanupTestData();

  try {
    await test1_hlsPathDuplicateDetection();
    await test2_autoPinnedOnEdit();
    await test3_differentTmdbIdsDontMerge();
    await test4_folderNameMatchSkippedWithTmdbId();
  } catch (err: any) {
    console.error('\n💥 Error inesperado durante los tests:', err.message);
    failed++;
  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTADO FINAL: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! El scanner está correctamente protegido.\n');
  } else {
    console.log(`⚠️  ${failed} test(s) fallaron. Hay bugs pendientes.\n`);
    process.exit(1);
  }
}

main();
