import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
async function clearLock() {
  await prisma.systemConfig.upsert({
    where: { key: 'SCANNER_LOCK' },
    update: { value: 'false' },
    create: { key: 'SCANNER_LOCK', value: 'false' }
  });
  console.log("✅ Bloqueo del escáner liberado correctamente.");
}
clearLock().finally(() => process.exit(0));
