const fs = require('fs');
const path = require('path');

const TARGET_DIR = process.argv[2] || '/home/media/peliculas';
const OUTPUT_FILE = path.join(__dirname, 'archivos_corruptos.txt');

async function getFiles(dir) {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
}

async function checkFile(filePath) {
    let fd = null;
    try {
        const stats = await fs.promises.stat(filePath);
        if (stats.size === 0) return true; // saltar archivos vacios
        
        fd = await fs.promises.open(filePath, 'r');
        const buffer = Buffer.alloc(1024 * 1024); // Leer bloque de 1MB
        
        // 1. Intentar leer el primer megabyte (cabeceras)
        await fd.read(buffer, 0, buffer.length, 0);
        
        // 2. Intentar leer el último megabyte
        const startLast = Math.max(0, stats.size - (1024 * 1024));
        await fd.read(buffer, 0, buffer.length, startLast);
        
        // 3. Intentar leer un megabyte a la mitad
        const middle = Math.floor(stats.size / 2);
        await fd.read(buffer, 0, buffer.length, middle);
        
        return true;
    } catch (err) {
        if (err.code === 'EIO' || err.message.includes('Input/output error')) {
            console.error(`\n[❌ DAÑO FÍSICO] Sector defectuoso detectado en archivo: ${filePath}`);
            fs.appendFileSync(OUTPUT_FILE, filePath + '\n');
            return false;
        }
        console.error(`\n[⚠️ ERROR DE LECTURA] No se pudo acceder a: ${filePath} - Motivo: ${err.message}`);
        return false;
    } finally {
        if (fd) await fd.close().catch(() => {});
    }
}

async function run() {
    console.log(`\n🔍 INICIANDO DIAGNÓSTICO DE DISCO DURO (I/O)`);
    console.log(`Ruta a analizar: ${TARGET_DIR}`);
    console.log(`ATENCIÓN: Si el disco tiene daño, el script puede "congelarse" 10-30 segundos por cada archivo dañado.\n`);
    
    if (fs.existsSync(OUTPUT_FILE)) {
        fs.unlinkSync(OUTPUT_FILE); // Limpiar historial anterior
    }

    try {
        const files = await getFiles(TARGET_DIR);
        // Filtrar solo extensiones de video comunes
        const videoFiles = files.filter(f => f.match(/\.(mkv|mp4|avi|webm|ts|m4v)$/i));
        console.log(`Se encontraron ${videoFiles.length} archivos de video. Comenzando lectura de prueba (Cabecera, Medio y Final)...`);
        
        let corruptos = 0;
        for (let i = 0; i < videoFiles.length; i++) {
            process.stdout.write(`\rRevisando archivo ${i+1} de ${videoFiles.length}... `);
            const isOk = await checkFile(videoFiles[i]);
            if (!isOk) corruptos++;
        }
        
        console.log('\n\n✅ Diagnóstico terminado.');
        if (corruptos > 0) {
            console.log(`⚠️ PELIGRO: Se encontraron ${corruptos} archivos ubicados en sectores dañados.`);
            console.log(`🚨 Debes ELIMINAR estos archivos para destrabar el disco.`);
            console.log(`📂 Revisa la lista completa en: ${OUTPUT_FILE}\n`);
        } else {
            console.log('🎉 EXCELENTE: No se detectaron errores de I/O. Ninguno de estos archivos choca con los sectores malos.\n');
        }
    } catch (err) {
        console.error('\nError crítico escaneando el directorio:', err);
    }
}

run();
