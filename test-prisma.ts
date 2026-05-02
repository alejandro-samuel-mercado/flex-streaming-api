import { prisma } from './src/shared/config/prisma';

async function main() {
  console.log('Models on prisma client:', Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_')));
}

main().catch(console.error);
