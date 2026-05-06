import { prisma } from './src/shared/config/prisma';

const packages = [
  { name: '15 Créditos', baseCredits: 15, bonusCredits: 0, isPromo: false, sortOrder: 1 },
  { name: '30 Créditos', baseCredits: 30, bonusCredits: 0, isPromo: false, sortOrder: 2 },
  { name: '50 Créditos', baseCredits: 50, bonusCredits: 0, isPromo: false, sortOrder: 3 },
  { name: '100 Créditos', baseCredits: 100, bonusCredits: 0, isPromo: false, sortOrder: 4 },
  { name: '150 Créditos', baseCredits: 150, bonusCredits: 0, isPromo: false, sortOrder: 5 },
  { name: 'Promo 15 + 2 Créditos', baseCredits: 15, bonusCredits: 2, isPromo: true, sortOrder: 6 },
  { name: 'Promo 30 + 5 Créditos', baseCredits: 30, bonusCredits: 5, isPromo: true, sortOrder: 7 },
  { name: 'Promo 50 + 10 Créditos', baseCredits: 50, bonusCredits: 10, isPromo: true, sortOrder: 8 },
];

async function seed() {
  console.log('Seeding packages...');
  for (const pkg of packages) {
    const exists = await prisma.creditPackage.findFirst({ where: { name: pkg.name } });
    if (!exists) {
      await prisma.creditPackage.create({ data: pkg });
      console.log(`Created package: ${pkg.name}`);
    } else {
      console.log(`Package ${pkg.name} already exists.`);
    }
  }
  console.log('Done.');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
