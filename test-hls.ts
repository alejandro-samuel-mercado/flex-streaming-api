import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
    const vf = await prisma.videoFile.findUnique({ where: { id: 'cmr5v3bcv01kbvhq2q1ujereb' } });
    if (!vf) return console.log('No existe en BD');
    
    console.log('originalPath:', vf.originalPath);
    console.log('hlsPath (BD):', vf.hlsPath);
    
    let resolvedRoot = '';
    if (vf.hlsPath) {
        if (path.isAbsolute(vf.hlsPath)) {
            resolvedRoot = vf.hlsPath;
        } else if (vf.hlsPath.startsWith('media/hls')) {
            resolvedRoot = path.resolve(process.env.HLS_PATH || '/home/media/hls', vf.hlsPath.replace('media/hls', '').replace(/^\//, ''));
        } else {
            resolvedRoot = path.resolve(process.cwd(), vf.hlsPath);
        }
    } else {
        resolvedRoot = path.resolve(process.env.HLS_PATH || '/home/media/hls', vf.id);
    }
    
    console.log('Carpeta FINAL donde el servidor de Series lo está buscando:', resolvedRoot);
    console.log('¿Existe esa carpeta en este servidor?:', fs.existsSync(resolvedRoot) ? 'SÍ' : 'NO');
    
    if (fs.existsSync(resolvedRoot)) {
        console.log('Archivos adentro:', fs.readdirSync(resolvedRoot));
    }
}
run();
