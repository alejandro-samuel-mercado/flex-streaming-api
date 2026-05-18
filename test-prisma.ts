import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const favorites = await prisma.favorite.findMany();
    console.log("Favorites count:", favorites.length);
    console.log("First favorite:", favorites[0]);
  } catch (err) {
    console.error("PRISMA FAVORITE ERROR:", err);
  }
}
main().finally(() => prisma.$disconnect());
