import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    const updated = await prisma.endUserAccount.update({
        where: { username: "luis177" },
        data: { deletedAt: null }
    });
    console.log("Restored:", updated.username);
}
main().catch(console.error);
