require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const p = await prisma.profile.findUnique({ where: { id: 'cmoyztnst00jyn8o2l3rnzutf' } });
  console.log("Profile:", p ? "EXISTS" : "MISSING");
  const c = await prisma.content.findUnique({ where: { id: 'cmp8sp78y062v8jz6ruzvy07c' } });
  console.log("Content:", c ? "EXISTS" : "MISSING");
  process.exit(0);
}
run();
