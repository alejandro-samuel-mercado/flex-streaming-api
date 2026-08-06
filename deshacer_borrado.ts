import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function deshacer() {
    console.log("🚑 Restaurando todos los contenidos borrados hoy...");
    
    // Obtener el inicio del día de hoy para no revivir cosas borradas hace meses
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const result = await prisma.content.updateMany({
        where: {
            deletedAt: { gte: hoy }
        },
        data: {
            deletedAt: null
        }
    });

    console.log(`✅ ¡Magia! Se han restaurado y devuelto a la vida ${result.count} contenidos en tu panel.`);
}

deshacer().catch(console.error).finally(() => process.exit(0));
