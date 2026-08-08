import { prisma } from './src/shared/config/prisma';
async function main() {
  const content = await prisma.content.findUnique({ where: { id: 'cms0eq1m80008qerxlaunqeuz' }, include: { translations: true } });
  console.log(content);
}
main().catch(console.error).finally(() => process.exit(0));
