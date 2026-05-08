import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando migración de correos a nombres de usuario...');
  
  const users = await prisma.user.findMany({
    where: { username: null }
  });

  console.log(`📊 Encontrados ${users.length} usuarios sin nombre de usuario.`);

  for (const user of users) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { username: user.email }
      });
      console.log(`✅ Usuario ${user.email} actualizado.`);
    } catch (err) {
      console.error(`❌ Error actualizando ${user.email}:`, err);
    }
  }

  console.log('✨ Migración finalizada.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
