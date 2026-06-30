import fs from 'fs';
import path from 'path';

function printDir(dir, prefix = '') {
    if (!fs.existsSync(dir)) {
        console.log(`❌ No existe el directorio: ${dir}`);
        return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.length === 0) {
        console.log(`${prefix}📂 (Vacío)`);
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            console.log(`${prefix}📁 ${entry.name}`);
            printDir(path.join(dir, entry.name), prefix + '  ');
        } else {
            console.log(`${prefix}📄 ${entry.name}`);
        }
    }
}

console.log("Revisando la carpeta 'Yo no soy Mendoza' en /home/media/series/ ...");
const target = '/home/media/series/Yo no soy Mendoza';
printDir(target);
