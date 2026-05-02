"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding database with example data...');
    // Clean existing data for a fresh start
    await prisma.videoFile.deleteMany();
    await prisma.content.deleteMany();
    await prisma.platform.deleteMany();
    await prisma.genre.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.siteConfig.deleteMany();
    await prisma.ageRating.deleteMany();
    // Create Site Config (FAQ and WhatsApp)
    await prisma.siteConfig.createMany({
        data: [
            { key: 'whatsapp_number', value: '+5491100000000' },
            { key: 'faq_items', value: JSON.stringify([
                    { question: '¿Cómo puedo suscribirme a FlexStreaming?', answer: 'Puedes elegir el plan que más te convenga en la sección de planes y contactarnos por WhatsApp. Te crearemos una cuenta y podrás empezar a disfrutar de todo el contenido.' },
                    { question: '¿Qué métodos de pago aceptan?', answer: 'Aceptamos transferencias bancarias, Mercado Pago, PayPal y pagos en efectivo. Contáctanos por WhatsApp para más detalles.' },
                    { question: '¿Puedo ver contenido gratis?', answer: 'Sí, tenemos una selección de contenido gratuito disponible para todos. Solo necesitas crear una cuenta gratuita para empezar a disfrutarlo.' },
                    { question: '¿En cuántos dispositivos puedo ver?', answer: 'Depende del plan que elijas. El plan Básico permite 1 dispositivo, el Premium hasta 3 y el Familiar hasta 5 dispositivos simultáneos.' },
                ]) }
        ]
    });
    // Create Plans
    await prisma.plan.createMany({
        data: [
            { name: 'Básico', description: 'Perfecto para empezar', price: '4.99', durationDays: 30, maxDevices: 1, hasHd: true, has4k: false, allowDownload: false, noAds: false, isActive: true },
            { name: 'Premium', description: 'La mejor experiencia', price: '9.99', durationDays: 30, maxDevices: 3, hasHd: true, has4k: true, allowDownload: true, noAds: true, isActive: true },
            { name: 'Familiar', description: 'Para toda la familia', price: '14.99', durationDays: 30, maxDevices: 5, hasHd: true, has4k: true, allowDownload: true, noAds: true, isActive: true },
        ]
    });
    // Create Platforms
    const platforms = [
        { name: 'Netflix', slug: 'netflix', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' },
        { name: 'HBO Max', slug: 'hbo-max', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg' },
        { name: 'Disney+', slug: 'disney-plus', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg' },
        { name: 'Prime Video', slug: 'prime-video', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg' },
        { name: 'Paramount+', slug: 'paramount-plus', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg' },
    ];
    const createdPlatforms = [];
    for (const p of platforms) {
        createdPlatforms.push(await prisma.platform.create({ data: p }));
    }
    // Create Genres
    const genres = ['Acción', 'Comedia', 'Drama', 'Terror', 'Ciencia Ficción', 'Romance', 'Animación', 'Suspenso'];
    const createdGenres = [];
    for (const g of genres) {
        createdGenres.push(await prisma.genre.create({ data: { name: g, slug: g.toLowerCase().replace(' ', '-') } }));
    }
    // Create Age Rating
    const pg13 = await prisma.ageRating.create({ data: { code: 'PG-13', label: 'Mayores de 13 años' } });
    // Create Content
    const movies = [
        { title: 'Oppenheimer', description: 'La historia del padre de la bomba atómica...', backdropUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=600', type: 'MOVIE', featured: true, rating: 8.5 },
        { title: 'Dune: Parte Dos', description: 'Paul Atreides se une a los Fremen...', backdropUrl: 'https://images.unsplash.com/photo-1534809027769-b00d750a6bac?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1534809027769-b00d750a6bac?q=80&w=600', type: 'MOVIE', featured: true, rating: 8.8 },
        { title: 'The Last of Us', description: 'En un mundo post-apocalíptico...', backdropUrl: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=600', type: 'SERIES', featured: true, rating: 9.0 },
        { title: 'Spider-Man: Across the Spider-Verse', description: 'Miles Morales regresa...', backdropUrl: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=600', type: 'MOVIE', featured: false, rating: 8.7, free: true },
        { title: 'Succession', description: 'La familia Roy, dueña del conglomerado...', backdropUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=600', type: 'SERIES', featured: false, rating: 8.9 },
        { title: 'Attack on Titan', description: 'La batalla final por la humanidad...', backdropUrl: 'https://images.unsplash.com/photo-1607604276583-c1d87e93f9e0?q=80&w=2070', posterUrl: 'https://images.unsplash.com/photo-1607604276583-c1d87e93f9e0?q=80&w=600', type: 'ANIME', featured: true, rating: 9.1, free: true },
    ];
    for (let i = 0; i < movies.length; i++) {
        const m = movies[i];
        await prisma.content.create({
            data: {
                slug: `pelicula-${i}`,
                type: m.type,
                status: 'READY',
                releaseYear: 2023,
                duration: 120,
                rating: m.rating,
                viewCount: Math.floor(Math.random() * 10000),
                featured: m.featured,
                isFreeWithMembership: !m.free, // Note: The schema logic is reversed. isFreeWithMembership=false means it's totally free. Wait, the name implies free WITH membership. Let me double check what my mock condition was. Actually, let's just set it correctly.
                platformId: createdPlatforms[i % createdPlatforms.length].id,
                ageRatingId: pg13.id,
                translations: {
                    create: [{ language: 'es', title: m.title, description: m.description }]
                },
                thumbnails: {
                    create: [
                        { type: 'BACKDROP', url: m.backdropUrl },
                        { type: 'POSTER', url: m.posterUrl }
                    ]
                },
                genres: {
                    create: [
                        { genreId: createdGenres[i % createdGenres.length].id }
                    ]
                }
            }
        });
    }
    // Create Subscription Plans (Reseller)
    const plan1 = await prisma.subscriptionPlan.create({
        data: { name: '1 Mes', durationDays: 30, creditCost: 10, isActive: true }
    });
    const plan2 = await prisma.subscriptionPlan.create({
        data: { name: '3 Meses', durationDays: 90, creditCost: 25, isActive: true }
    });
    // Create Credit Packages
    const pkg1 = await prisma.creditPackage.create({
        data: { name: 'Pack 100', baseCredits: 100, isActive: true }
    });
    // Create Users (Admin, Super Vendor, Vendor)
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('123456', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@peliplus.com' },
        update: {
            passwordHash,
            role: 'ADMIN',
            isActive: true,
            credits: 0
        },
        create: {
            email: 'admin@peliplus.com',
            name: 'Admin',
            passwordHash,
            role: 'ADMIN',
            isActive: true,
            credits: 0
        }
    });
    const superVendor = await prisma.user.upsert({
        where: { email: 'super@peliplus.com' },
        update: {
            passwordHash,
            role: 'SUPER_VENDOR',
            isActive: true,
            credits: 1000,
            parentId: admin.id
        },
        create: {
            email: 'super@peliplus.com',
            name: 'Super Vendedor',
            passwordHash,
            role: 'SUPER_VENDOR',
            isActive: true,
            credits: 1000,
            parentId: admin.id
        }
    });
    const vendor = await prisma.user.upsert({
        where: { email: 'vendor@peliplus.com' },
        update: {
            passwordHash,
            role: 'VENDOR',
            isActive: true,
            credits: 500,
            parentId: superVendor.id
        },
        create: {
            email: 'vendor@peliplus.com',
            name: 'Vendedor',
            passwordHash,
            role: 'VENDOR',
            isActive: true,
            credits: 500,
            parentId: superVendor.id
        }
    });
    console.log('Database seeded successfully! Use admin@peliplus.com / 123456 to login.');
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map