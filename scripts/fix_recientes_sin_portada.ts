import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { TMDBService } from '../src/services/tmdb.service';
import fs from 'fs';
import path from 'path';
import { env } from '../src/shared/config/env';

dotenv.config();
const prisma = new PrismaClient();

async function run() {
    console.log('🔍 Buscando TODOS los contenidos sin portada para REPARARLOS con TMDB...');
    
    try {
        const contents = await prisma.content.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200, // SOLO LOS ULTIMOS 200 SUBIDOS
            include: { 
                translations: true,
                thumbnails: true
            }
        });

        const brokenContents = contents.filter(c => {
            const hasDescription = c.translations.some((t: any) => t.description && t.description.trim().length > 0);
            const hasTmdbId = c.tmdbId && c.tmdbId.trim().length > 0;
            
            let hasValidPoster = false;
            const posterRecord = c.thumbnails.find((t: any) => t.type === 'POSTER');
            
            if (posterRecord) {
                // Verificar si el archivo físico realmente existe en el disco
                const expectedPath = path.join(env.MEDIA_PATH, 'thumbnails', c.id, 'poster.jpg');
                if (fs.existsSync(expectedPath)) {
                    hasValidPoster = true;
                }
            }
            
            return !hasValidPoster || !hasDescription || !hasTmdbId;
        });

        if (brokenContents.length === 0) {
            console.log('✅ Ningún contenido reciente necesita arreglo.');
            process.exit(0);
        }

        console.log(`⚠️ Se encontraron ${brokenContents.length} contenidos sin metadata. Descargando datos de TMDB...`);

        const baseUrl = env.BACKEND_URL.replace(/\/$/, '');
        let arreglados = 0;

        for (const c of brokenContents) {
            const title = c.translations[0]?.title || c.slug;
            console.log(`\n⏳ Reparando: "${title}" (ID: ${c.id}, Tipo: ${c.type})`);
            
            // 1. Buscar en TMDB
            const forceType = (c.type === 'SERIES' || c.type === 'ANIME' || c.type === 'DOCUMENTARY') ? 'tv' : 'movie';
            const searchTitle = title.replace(/-/g, ' '); // Limpiar slug si no hay titulo
            
            const tmdbResult = await TMDBService.searchWithFallback(searchTitle, 'es-ES', forceType).catch(() => ({ bestMatch: null }));
            
            if (!tmdbResult.bestMatch) {
                console.log(`   ❌ No se encontró coincidencia en TMDB para "${searchTitle}". Pasando a PENDIENTE.`);
                await prisma.content.update({ where: { id: c.id }, data: { status: 'PENDING' } });
                continue;
            }

            // 2. Obtener detalles completos
            const details = await TMDBService.getFullDetails(tmdbResult.bestMatch.id, forceType);
            
            // 3. Actualizar la sinopsis
            if (c.translations.length > 0) {
                await prisma.contentTranslation.update({
                    where: { contentId_language: { contentId: c.id, language: 'es' } },
                    data: { title: details.title, description: details.synopsis }
                });
            } else {
                await prisma.contentTranslation.create({
                    data: { contentId: c.id, language: 'es', title: details.title, description: details.synopsis }
                });
            }

            // 4. Limpiar portadas viejas/rotas y descargar nuevas
            await prisma.thumbnail.deleteMany({ where: { contentId: c.id } });
            const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', c.id);
            if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

            if (details.posterPath) {
                try {
                    await TMDBService.downloadImage(details.posterPath, path.join(mediaFolder, 'poster.jpg'));
                    await prisma.thumbnail.create({ 
                        data: { contentId: c.id, type: 'POSTER', url: `${baseUrl}/media/thumbnails/${c.id}/poster.jpg`, width: 500, height: 750 } 
                    });
                    console.log('   ✅ Portada descargada.');
                } catch (e) { console.log('   ❌ Error bajando portada.'); }
            }

            if (details.backdropPath) {
                try {
                    await TMDBService.downloadImage(details.backdropPath, path.join(mediaFolder, 'backdrop.jpg'));
                    await prisma.thumbnail.create({ 
                        data: { contentId: c.id, type: 'BACKDROP', url: `${baseUrl}/media/thumbnails/${c.id}/backdrop.jpg`, width: 1920, height: 1080 } 
                    });
                } catch (e) {}
            }

            // Actualizar tmdbId y activar
            try {
                await prisma.content.update({
                    where: { id: c.id },
                    data: { tmdbId: String(details.tmdbId), status: 'ACTIVE' }
                });
                console.log(`   🚀 ¡Reparado con éxito! Metadata y portadas agregadas.`);
                arreglados++;
            } catch (updateErr: any) {
                if (updateErr.code === 'P2002') {
                    console.log(`   ⚠️ Ya existe otro contenido con este TMDB ID. Pasando a PENDIENTE para revisión manual.`);
                    await prisma.content.update({ where: { id: c.id }, data: { status: 'PENDING' } });
                } else {
                    console.log(`   ❌ Error guardando los cambios: ${updateErr.message}`);
                }
            }
        }

        console.log(`\n🎉 Listo! ${arreglados} contenidos fueron reparados y poblados con TMDB.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error ejecutando el script:', err);
        process.exit(1);
    }
}

run();
