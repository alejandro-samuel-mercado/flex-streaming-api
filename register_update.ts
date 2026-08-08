import { AppVersionService } from './src/modules/app-version/app-version.service';
import fs from 'fs';
import path from 'path';

async function main() {
    const apkPath = process.argv[2];
    const changelog = process.argv[3] || 'Actualización con arreglos en Auto-play y Popups fantasma.';
    
    if (!apkPath || !fs.existsSync(apkPath)) {
        console.error('Uso: npx tsx register_update.ts <ruta_al_apk> [changelog]');
        process.exit(1);
    }
    
    const dir = AppVersionService.getApkDir('android');
    fs.mkdirSync(dir, { recursive: true });
    
    const apkFilename = 'NUBA-ANDROID-V1.0.1.apk';
    const targetPath = path.join(dir, apkFilename);
    
    console.log(`Copiando APK a ${targetPath}...`);
    fs.copyFileSync(apkPath, targetPath);
    
    const fileSize = fs.statSync(targetPath).size;
    
    // Leer registro actual
    // Need to use any to bypass private method if needed, but we can just require it or replicate it
    const registryPath = path.join(dir, 'registry.json');
    let registry = { active: null as string | null, versions: [] as any[] };
    if (fs.existsSync(registryPath)) {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    }
    
    const entry = {
        filename: apkFilename,
        versionName: '1.0.1',
        versionCode: 2,
        platform: 'android',
        uploadedAt: new Date().toISOString(),
        fileSize,
        downloadUrl: `http://localhost:4000/api/app/download?platform=android&filename=${encodeURIComponent(apkFilename)}`,
        changelogFile: null,
        changelog,
        isActive: true
    };
    
    registry.versions = registry.versions.filter(v => v.filename !== apkFilename);
    registry.versions.push(entry);
    registry.active = apkFilename;
    
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    
    console.log('¡Actualización registrada exitosamente en el backend!');
    console.log('La próxima vez que abras la app (antigua) en el teléfono, saltará el aviso de actualización.');
}
main().catch(console.error);
