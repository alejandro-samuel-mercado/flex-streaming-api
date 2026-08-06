import 'dotenv/config';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

async function makeBackup() {
    const backupDir = '/home/copia_seguridad_nuba';
    
    // Crear el directorio si no existe
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const date = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const fileName = `peliplus_db_NUEVO_${date}.sql.gz`;
    const filePath = path.join(backupDir, fileName);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error("❌ No se encontró DATABASE_URL en el archivo .env");
        process.exit(1);
    }

    console.log(`⏳ Iniciando respaldo de la base de datos...`);
    console.log(`Destino: ${filePath}`);

    // Ejecutar pg_dump y comprimir con gzip
    const command = `pg_dump "${dbUrl}" | gzip > "${filePath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error al hacer la copia de seguridad: ${error.message}`);
            return;
        }
        console.log(`✅ ¡Copia de seguridad completada con éxito!`);
        console.log(`📁 Archivo guardado en: ${filePath}`);
    });
}

makeBackup();
