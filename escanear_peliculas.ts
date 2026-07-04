import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import fs from 'fs';
import path from 'path';

const LOCK_FILE = path.join(process.cwd(), 'peliculas_scanner.lock');

async function run() {
    if (fs.existsSync(LOCK_FILE)) {
        // Verificar si el lock file es muy viejo (ej. se cayó el proceso anterior)
        const stats = fs.statSync(LOCK_FILE);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > 2 * 60 * 60 * 1000) { // 2 horas max
            console.log('🧹 Lock file viejo detectado. Limpiando...');
            fs.unlinkSync(LOCK_FILE);
        } else {
            console.log('⏳ Otro escaneo de PELÍCULAS está en curso. Saliendo...');
            process.exit(0);
        }
    }

    // Crear lock file
    fs.writeFileSync(LOCK_FILE, new Date().toISOString());

    console.log('🔍 Iniciando Escaneo de PELÍCULAS Manual...');
    try {
        // Escaneamos las peliculas usando el directorio configurado
        const moviePath = process.env.MEDIA_SCAN_DIRS || '/home/media/peliculas';
        console.log(`Buscando en directorio: ${moviePath}`);

        // scanDirectories(moviePath, seriesPath) -> pasamos undefined a seriesPath
        const files = await MediaScannerService.scanDirectories(moviePath, undefined);
        console.log(`[MediaScanner] Escaneo completo: ${files.length} archivos de películas encontrados.`);

        // Importar secuencialmente para no sobrecargar la API de TMDB (Evita Error 429 Too Many Requests)
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (!f.alreadyImported) {
                if (f.extension === 'VACÍA') {
                    console.log(`⚠️  Registrando carpeta vacía como Fallida: ${f.fileName} (Falta video)`);
                    await MediaScannerService.importFile(f.filePath, 'MOVIE', f.episode);
                } else {
                    console.log(`⏳ [${i + 1}/${files.length}] Encolando Película: ${f.fileName}...`);
                    await MediaScannerService.importFile(f.filePath, 'MOVIE', f.episode);
                    // Pausa de 200ms entre llamadas para no saturar a TMDB
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }

        console.log('✅ ¡Escaneo de Películas Finalizado!');
        if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal en el escáner de películas:', err);
        if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
        process.exit(1);
    }
}

// Interceptar señales de cierre para limpiar el lock file
process.on('SIGINT', () => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit();
});
process.on('SIGTERM', () => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit();
});

run();
