import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function activarContenidos() {
    console.log("🔍 Analizando contenidos para activación automática...\n");

    const contenidos = await prisma.content.findMany({
        where: {
            status: { not: 'ACTIVE' }, // Solo procesamos los que no estén activos
            deletedAt: null
        },
        include: {
            videoFiles: true,
            thumbnails: true,
            translations: true,
            seasons: {
                include: {
                    episodes: {
                        include: { videoFiles: true }
                    }
                }
            }
        }
    });

    let activados = 0;
    let ignorados = 0;

    for (const c of contenidos) {
        let cumpleCriterios = true;
        let razonFallo = "";

        // 1. Validar información básica (Título y Descripción)
        const tieneTraduccionValida = c.translations.some(t => t.title && t.description && t.description.length > 5 && t.description !== 'Sin sinopsis disponible.');
        if (!tieneTraduccionValida) {
            cumpleCriterios = false;
            razonFallo = "Falta información (Título o Descripción válida)";
        }

        // 2. Validar Portadas y Banners
        const tienePoster = c.thumbnails.some(th => th.type === 'POSTER' && th.url);
        const tieneBackdrop = c.thumbnails.some(th => th.type === 'BACKDROP' && th.url);
        if (cumpleCriterios && (!tienePoster || !tieneBackdrop)) {
            cumpleCriterios = false;
            razonFallo = "Faltan imágenes (Poster o Backdrop)";
        }

        // 3. Validar Videos según el tipo (Película o Serie)
        if (cumpleCriterios) {
            if (c.type === 'MOVIE') {
                const tieneVideoValido = c.videoFiles.some(vf => vf.status === 'COMPLETED' && vf.masterPlaylist && vf.masterPlaylist.trim() !== '');
                if (!tieneVideoValido) {
                    cumpleCriterios = false;
                    razonFallo = "Película sin archivo de video completo (o sin masterPlaylist)";
                }
            } else if (c.type === 'SERIES' || c.type === 'ANIME' || c.type === 'NOVELA') {
                let episodiosCompletos = 0;
                for (const season of c.seasons) {
                    for (const episode of season.episodes) {
                        const tieneVideo = episode.videoFiles.some(vf => vf.status === 'COMPLETED' && vf.masterPlaylist && vf.masterPlaylist.trim() !== '');
                        if (tieneVideo) episodiosCompletos++;
                    }
                }
                
                if (episodiosCompletos < 4) {
                    cumpleCriterios = false;
                    razonFallo = `Serie incompleta (Solo tiene ${episodiosCompletos} episodios, necesita al menos 4)`;
                }
            } else {
                cumpleCriterios = false;
                razonFallo = `Tipo de contenido no soportado para auto-activación: ${c.type}`;
            }
        }

        // 4. Activar si cumple todo
        if (cumpleCriterios) {
            await prisma.content.update({
                where: { id: c.id },
                data: { status: 'ACTIVE' }
            });
            console.log(`✅ ACTIVADO: "${c.title || c.slug}" (${c.type})`);
            activados++;
        } else {
            console.log(`❌ IGNORADO: "${c.title || c.slug}" -> ${razonFallo}`);
            ignorados++;
        }
    }

    console.log(`\n🎉 Resumen Final: ${activados} contenidos activados, ${ignorados} ignorados.`);
}

activarContenidos().finally(() => process.exit(0));
